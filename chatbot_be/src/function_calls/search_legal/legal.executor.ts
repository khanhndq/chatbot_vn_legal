import { ToolExecutor } from "../../services/open-ai.service";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import { LegalSearchResult, LegalSearchResponse } from "./legal.types";

/** Pinecone client singleton (lazy-initialized) */
let pineconeClient: Pinecone | null = null;
let openaiClient: OpenAI | null = null;

function getPinecone(): Pinecone {
  if (!pineconeClient) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error("PINECONE_API_KEY is not configured");
    }
    pineconeClient = new Pinecone({ apiKey });
  }
  return pineconeClient;
}

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Generate embedding for a query string.
 */
async function embedQuery(query: string): Promise<number[]> {
  const openai = getOpenAI();
  const embeddingModel =
    process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  const embeddingDimensions = parseInt(
    process.env.EMBEDDING_DIMENSIONS || "1536",
    10,
  );

  const response = await openai.embeddings.create({
    model: embeddingModel,
    dimensions: embeddingDimensions,
    input: query,
  });

  return response.data[0].embedding;
}

/**
 * Query Pinecone with a vector and optional filter.
 */
async function queryPinecone(
  vector: number[],
  topK: number,
  filter?: Record<string, unknown>,
): Promise<LegalSearchResult[]> {
  const pinecone = getPinecone();
  const indexName = process.env.PINECONE_INDEX || "chatbot-vn-legal";
  const index = pinecone.index(indexName);

  const queryResult = await index.query({
    vector,
    topK,
    includeMetadata: true,
    filter,
  });

  return (queryResult.matches || []).map((match) => {
    const meta = (match.metadata || {}) as Record<
      string,
      string | number | boolean
    >;
    return {
      id: match.id,
      score: match.score || 0,
      text: (meta.text as string) || "",
      source_type: (meta.source_type as "law" | "precedent" | "faq") || "law",
      document_name: (meta.document_name as string) || "",
      metadata: meta,
    };
  });
}

/**
 * Format a single result for the LLM response.
 */
function formatResult(r: LegalSearchResult): Record<string, unknown> {
  const base: Record<string, unknown> = {
    source_type: r.source_type,
    document_name: r.document_name,
    score: Math.round(r.score * 1000) / 1000,
    text: r.text,
  };

  // Add source-specific metadata
  if (r.metadata.article) base.article = r.metadata.article;
  if (r.metadata.article_title) base.article_title = r.metadata.article_title;
  if (r.metadata.chapter) base.chapter = r.metadata.chapter;
  if (r.metadata.document_title)
    base.document_title = r.metadata.document_title;
  if (r.metadata.case_number) base.case_number = r.metadata.case_number;
  if (r.metadata.court) base.court = r.metadata.court;
  if (r.metadata.case_type) base.case_type = r.metadata.case_type;
  if (r.metadata.section) base.section = r.metadata.section;
  if (r.metadata.question) base.question = r.metadata.question;

  return base;
}

// ═══════════════════════════════════════════════════════════════════════
//  CBR + RAG Combined Search Strategy
// ═══════════════════════════════════════════════════════════════════════

/**
 * Phase 1 — RAG: Search laws and FAQ for relevant legal provisions.
 * Returns factual legal text as ground truth.
 */
async function ragSearch(
  vector: number[],
  topK: number,
): Promise<LegalSearchResult[]> {
  return queryPinecone(vector, topK, {
    source_type: { $in: ["law", "faq"] },
  });
}

/**
 * Phase 2 — CBR: Search precedents for similar court cases.
 * Returns case reasoning and decisions for analogical reasoning.
 */
async function cbrSearch(
  vector: number[],
  topK: number,
): Promise<LegalSearchResult[]> {
  return queryPinecone(vector, topK, {
    source_type: { $eq: "precedent" },
  });
}

/**
 * Combined CBR + RAG search.
 *
 * Executes both searches in parallel and returns structured results
 * with clear separation between legal provisions (RAG) and case
 * precedents (CBR).
 */
async function searchLegalCBRRAG(
  query: string,
  sourceType?: string,
  topK: number = 5,
): Promise<{
  rag_results: LegalSearchResult[];
  cbr_results: LegalSearchResult[];
  total: number;
}> {
  topK = Math.min(Math.max(topK, 1), 10);

  // Embed the query once
  const queryVector = await embedQuery(query);

  // If user explicitly filters by source type, do a single search
  if (sourceType === "law" || sourceType === "faq") {
    const results = await queryPinecone(queryVector, topK, {
      source_type: { $eq: sourceType },
    });
    return { rag_results: results, cbr_results: [], total: results.length };
  }

  if (sourceType === "precedent") {
    const results = await queryPinecone(queryVector, topK, {
      source_type: { $eq: "precedent" },
    });
    return { rag_results: [], cbr_results: results, total: results.length };
  }

  // Default: Execute both RAG and CBR in parallel
  const [ragResults, cbrResults] = await Promise.all([
    ragSearch(queryVector, topK),
    cbrSearch(queryVector, Math.min(topK, 3)), // Fewer precedents (they're longer)
  ]);

  return {
    rag_results: ragResults,
    cbr_results: cbrResults,
    total: ragResults.length + cbrResults.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  Tool Executor
// ═══════════════════════════════════════════════════════════════════════

/**
 * Tool executor for search_legal — called by the OpenAI function calling system.
 *
 * Returns structured results with two sections:
 *   - legal_provisions (RAG): Relevant law articles and FAQ answers
 *   - case_precedents (CBR): Similar court cases with reasoning
 */
export const legalToolExecutor: ToolExecutor = async (
  name: string,
  args: Record<string, unknown>,
): Promise<string> => {
  if (name === "search_legal") {
    const query = args.query as string;
    const sourceType = args.source_type as string | undefined;
    const topK = (args.top_k as number) || 5;

    console.log(
      `🔍 [CBR+RAG] Searching legal KB for: "${query}"` +
        (sourceType ? ` [filter: ${sourceType}]` : "") +
        ` [top_k: ${topK}]`,
    );

    try {
      const { rag_results, cbr_results, total } = await searchLegalCBRRAG(
        query,
        sourceType,
        topK,
      );

      if (total === 0) {
        return JSON.stringify({
          found: false,
          message: "Không tìm thấy tài liệu pháp luật liên quan.",
          suggestion:
            "Thử diễn đạt lại câu hỏi hoặc sử dụng thuật ngữ pháp lý khác.",
        });
      }

      const response: Record<string, unknown> = {
        found: true,
        strategy: "CBR+RAG",
      };

      // RAG section: legal provisions
      if (rag_results.length > 0) {
        response.legal_provisions = {
          description: "Các điều luật và quy định pháp luật liên quan (RAG)",
          count: rag_results.length,
          results: rag_results.map(formatResult),
        };
      }

      // CBR section: case precedents
      if (cbr_results.length > 0) {
        response.case_precedents = {
          description: "Các bản án và án lệ tương tự để suy luận (CBR)",
          count: cbr_results.length,
          results: cbr_results.map(formatResult),
        };
      }

      return JSON.stringify(response);
    } catch (error) {
      console.error("❌ search_legal error:", error);
      return JSON.stringify({
        found: false,
        message: "Đã xảy ra lỗi khi tra cứu cơ sở dữ liệu pháp luật.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new Error(`Unknown tool: ${name}`);
};
