/**
 * Main Indexing Pipeline
 *
 * Orchestrates the full pipeline:
 *   1. Parse all 3 data sources into Chunk[]
 *   2. Save intermediate JSON to dataset/json/ for inspection
 *   3. Generate embeddings via OpenAI in batches
 *   4. Upsert vectors to Pinecone in batches
 *   5. Log summary stats
 *
 * Usage:
 *   npx ts-node src/index.ts              # Full pipeline
 *   npx ts-node src/index.ts --dry-run    # Parse + save JSON only (no API calls)
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { parseAllLaws, parseAllPrecedents, parseAllFAQs } from "./parsers";
import { Chunk, PipelineConfig, PipelineStats } from "./types";

dotenv.config();

/**
 * Max CHARACTER count per chunk.
 *
 * Root cause analysis:
 *   - Vietnamese text averages ~5 chars per word (due to diacritics)
 *   - OpenAI cl100k_base tokenizer uses ~2 chars per token for Vietnamese
 *   - So a 19,000-char chunk ≈ 9,500 tokens (exceeds 8,192 limit)
 *
 * Hard limit: 14,000 chars → ~7,000 tokens → safe under 8,192.
 */
const MAX_CHUNK_CHARS = 14000;

/**
 * Estimate token count using CHARACTER count (reliable for Vietnamese).
 * Vietnamese text with cl100k_base: ~2 chars per token.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

/**
 * Split a single oversized chunk into smaller chunks at sentence boundaries.
 * Each sub-chunk inherits the original metadata with a _partN suffix on the ID.
 */
function splitOversizedChunk(chunk: Chunk, maxChars: number): Chunk[] {
  if (chunk.text.length <= maxChars) {
    return [chunk];
  }

  // Split on sentence boundaries (Vietnamese uses . ; ! ?)
  const sentences = chunk.text.split(/(?<=[.;!?\n])\s+/);
  const subChunks: Chunk[] = [];
  let currentSentences: string[] = [];
  let currentChars = 0;
  let partIndex = 1;

  for (const sentence of sentences) {
    const sentChars = sentence.length;

    if (currentChars + sentChars > maxChars && currentSentences.length > 0) {
      // Flush current sub-chunk
      subChunks.push({
        id: `${chunk.id}_part${partIndex}`,
        text: currentSentences.join(" "),
        metadata: { ...chunk.metadata },
      });
      partIndex++;
      currentSentences = [sentence];
      currentChars = sentChars;
    } else {
      currentSentences.push(sentence);
      currentChars += sentChars;
    }
  }

  // Flush remaining
  if (currentSentences.length > 0) {
    subChunks.push({
      id: subChunks.length > 0 ? `${chunk.id}_part${partIndex}` : chunk.id,
      text: currentSentences.join(" "),
      metadata: { ...chunk.metadata },
    });
  }

  return subChunks;
}

/**
 * Enforce max chunk size across all chunks.
 * Splits any chunk exceeding MAX_CHUNK_CHARS.
 */
function enforceMaxChunkSize(chunks: Chunk[]): {
  result: Chunk[];
  splitCount: number;
} {
  const result: Chunk[] = [];
  let splitCount = 0;

  for (const chunk of chunks) {
    const subChunks = splitOversizedChunk(chunk, MAX_CHUNK_CHARS);
    if (subChunks.length > 1) {
      splitCount++;
    }
    result.push(...subChunks);
  }

  return { result, splitCount };
}

/** Load config from environment */
function loadConfig(): PipelineConfig {
  const dryRun =
    process.argv.includes("--dry-run") || process.env.DRY_RUN === "true";

  return {
    pineconeApiKey: process.env.PINECONE_API_KEY || "",
    pineconeIndex: process.env.PINECONE_INDEX || "chatbot-vn-legal",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    embeddingModel: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    embeddingDimensions: parseInt(
      process.env.EMBEDDING_DIMENSIONS || "1536",
      10,
    ),
    batchSize: parseInt(process.env.BATCH_SIZE || "100", 10),
    dryRun,
    rawDataDir: path.join(__dirname, "..", "dataset", "raw"),
    jsonOutputDir: path.join(__dirname, "..", "dataset", "json"),
  };
}

/** Save chunks as JSON files for debugging/inspection */
function saveChunksToJson(
  chunks: Chunk[],
  sourceType: string,
  outputDir: string,
): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${sourceType}_chunks.json`);
  fs.writeFileSync(filePath, JSON.stringify(chunks, null, 2), "utf-8");
  console.log(`  💾 Saved ${chunks.length} chunks to ${filePath}`);
}

/** Generate embeddings in batches via OpenAI */
async function generateEmbeddings(
  texts: string[],
  openai: OpenAI,
  model: string,
  dimensions: number,
  batchSize: number,
): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(texts.length / batchSize);

    console.log(
      `  🧠 Embedding batch ${batchNum}/${totalBatches} (${batch.length} texts)...`,
    );

    const response = await openai.embeddings.create({
      model,
      dimensions,
      input: batch,
    });

    const embeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);

    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

/**
 * Sanitize chunk ID to ASCII (Pinecone requires ASCII-only IDs).
 * Strips Vietnamese diacritics using Unicode NFD normalization.
 * e.g. "điều_1" → "dieu_1", "Đ" → "D"
 */
function sanitizeId(id: string): string {
  return id
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Strip combining diacritical marks
    .replace(/[đ]/g, "d")
    .replace(/[Đ]/g, "D")
    .replace(/[^a-zA-Z0-9:_\-\.]/g, "_"); // Replace any remaining non-ASCII with _
}

/** Upsert vectors to Pinecone in batches */
async function upsertToPinecone(
  chunks: Chunk[],
  embeddings: number[][],
  pinecone: Pinecone,
  indexName: string,
  batchSize: number,
): Promise<number> {
  const index = pinecone.index(indexName);
  let totalUpserted = 0;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batchChunks = chunks.slice(i, i + batchSize);
    const batchEmbeddings = embeddings.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(chunks.length / batchSize);

    const vectors = batchChunks.map((chunk, j) => ({
      id: sanitizeId(chunk.id),
      values: batchEmbeddings[j],
      metadata: {
        ...chunk.metadata,
        text: chunk.text, // Store text in metadata for retrieval
      },
    }));

    console.log(
      `  📤 Upserting batch ${batchNum}/${totalBatches} (${vectors.length} vectors)...`,
    );

    await index.upsert(vectors);
    totalUpserted += vectors.length;
  }

  return totalUpserted;
}

/** Main pipeline entry point */
async function main(): Promise<void> {
  const startTime = Date.now();
  const config = loadConfig();

  console.log("═══════════════════════════════════════════════════════");
  console.log("  📋 Vietnamese Legal Data Indexing Pipeline");
  console.log("═══════════════════════════════════════════════════════");
  console.log(
    `  Mode: ${config.dryRun ? "🔍 DRY RUN (no API calls)" : "🚀 FULL PIPELINE"}`,
  );
  console.log(`  Embedding model: ${config.embeddingModel}`);
  console.log(`  Dimensions: ${config.embeddingDimensions}`);
  console.log(`  Batch size: ${config.batchSize}`);
  console.log(
    `  Max chars/chunk: ${MAX_CHUNK_CHARS} (~${MAX_CHUNK_CHARS / 2} tokens)`,
  );
  console.log("");

  // ── Step 1: Parse all data sources ──────────────────────────────────
  console.log("📖 Step 1: Parsing raw data sources...");
  console.log("");

  const lawsDir = path.join(config.rawDataDir, "laws");
  const precedentsDir = path.join(config.rawDataDir, "precedents");
  const faqDir = path.join(config.rawDataDir, "faq");

  let lawChunks = fs.existsSync(lawsDir) ? parseAllLaws(lawsDir) : [];
  console.log("");

  let precedentChunks = fs.existsSync(precedentsDir)
    ? parseAllPrecedents(precedentsDir)
    : [];
  console.log("");

  let faqChunks = fs.existsSync(faqDir) ? parseAllFAQs(faqDir) : [];
  console.log("");

  // ── Step 1.5: Enforce max chunk size ────────────────────────────────
  console.log("✂️  Step 1.5: Enforcing max chunk size...");
  const lawEnforced = enforceMaxChunkSize(lawChunks);
  const precEnforced = enforceMaxChunkSize(precedentChunks);
  const faqEnforced = enforceMaxChunkSize(faqChunks);

  lawChunks = lawEnforced.result;
  precedentChunks = precEnforced.result;
  faqChunks = faqEnforced.result;

  const totalSplits =
    lawEnforced.splitCount + precEnforced.splitCount + faqEnforced.splitCount;
  if (totalSplits > 0) {
    console.log(
      `  ⚠️  Split ${totalSplits} oversized chunks (limit: ${MAX_CHUNK_CHARS} chars)`,
    );
  } else {
    console.log("  ✅ All chunks within token limit");
  }
  console.log("");

  const allChunks = [...lawChunks, ...precedentChunks, ...faqChunks];

  console.log("  ─── Parsing Summary ───");
  console.log(`  Laws:       ${lawChunks.length} chunks`);
  console.log(`  Precedents: ${precedentChunks.length} chunks`);
  console.log(`  FAQs:       ${faqChunks.length} chunks`);
  console.log(`  TOTAL:      ${allChunks.length} chunks`);
  console.log("");

  // ── Step 2: Save intermediate JSON ──────────────────────────────────
  console.log("📦 Step 2: Saving intermediate JSON...");
  saveChunksToJson(lawChunks, "laws", config.jsonOutputDir);
  saveChunksToJson(precedentChunks, "precedents", config.jsonOutputDir);
  saveChunksToJson(faqChunks, "faq", config.jsonOutputDir);
  saveChunksToJson(allChunks, "all", config.jsonOutputDir);
  console.log("");

  // ── Stats tracking ──────────────────────────────────────────────────
  const stats: PipelineStats = {
    totalChunks: allChunks.length,
    lawChunks: lawChunks.length,
    precedentChunks: precedentChunks.length,
    faqChunks: faqChunks.length,
    embeddingsGenerated: 0,
    vectorsUpserted: 0,
    duration: 0,
  };

  if (config.dryRun) {
    console.log("🔍 Dry run mode — skipping embedding and Pinecone upsert.");
    console.log(
      "   Inspect the JSON files in dataset/json/ to validate chunking.",
    );
  } else {
    // Validate API keys
    if (!config.openaiApiKey) {
      throw new Error(
        "OPENAI_API_KEY is required. Set it in .env or environment.",
      );
    }
    if (!config.pineconeApiKey) {
      throw new Error(
        "PINECONE_API_KEY is required. Set it in .env or environment.",
      );
    }

    // ── Step 3: Generate embeddings ─────────────────────────────────
    console.log("🧠 Step 3: Generating embeddings...");
    const openai = new OpenAI({ apiKey: config.openaiApiKey });
    const texts = allChunks.map((c) => c.text);
    const embeddings = await generateEmbeddings(
      texts,
      openai,
      config.embeddingModel,
      config.embeddingDimensions,
      config.batchSize,
    );
    stats.embeddingsGenerated = embeddings.length;
    console.log(`  ✅ Generated ${embeddings.length} embeddings`);
    console.log("");

    // ── Step 4: Upsert to Pinecone ──────────────────────────────────
    console.log("📤 Step 4: Upserting to Pinecone...");
    const pinecone = new Pinecone({ apiKey: config.pineconeApiKey });
    stats.vectorsUpserted = await upsertToPinecone(
      allChunks,
      embeddings,
      pinecone,
      config.pineconeIndex,
      config.batchSize,
    );
    console.log(
      `  ✅ Upserted ${stats.vectorsUpserted} vectors to index "${config.pineconeIndex}"`,
    );
    console.log("");
  }

  // ── Final summary ─────────────────────────────────────────────────
  stats.duration = (Date.now() - startTime) / 1000;

  console.log("═══════════════════════════════════════════════════════");
  console.log("  ✅ Pipeline Complete!");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Total chunks:        ${stats.totalChunks}`);
  console.log(`  Embeddings created:  ${stats.embeddingsGenerated}`);
  console.log(`  Vectors upserted:    ${stats.vectorsUpserted}`);
  console.log(`  Duration:            ${stats.duration.toFixed(1)}s`);
  console.log("");

  // Save stats
  const statsPath = path.join(config.jsonOutputDir, "pipeline_stats.json");
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), "utf-8");
  console.log(`  📊 Stats saved to ${statsPath}`);
}

// Run
main().catch((err) => {
  console.error("❌ Pipeline failed:", err);
  process.exit(1);
});
