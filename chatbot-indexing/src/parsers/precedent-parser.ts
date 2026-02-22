/**
 * Precedent Parser — Section-level chunking for Vietnamese court case documents
 *
 * Strategy:
 *   - Extract header metadata (case number, court, case type) from the first lines
 *   - Split into logical sections: header/parties, facts, reasoning, decision
 *   - Apply recursive splitting for sections > 1000 tokens
 *   - 100-token overlap between adjacent chunks within the same section
 */

import * as fs from "fs";
import * as path from "path";
import { Chunk, PrecedentMetadata } from "../types";

/** Section markers in Vietnamese court documents */
const SECTION_MARKERS = [
  { pattern: /^(NHẬN THẤY|Nhận thấy)[:\s]/m, label: "facts" },
  { pattern: /^(XÉT THẤY|Xét thấy)[:\s]/m, label: "reasoning" },
  { pattern: /^(QUYẾT ĐỊNH|Quyết định)[:\s]/m, label: "decision" },
  { pattern: /^(BẢN ÁN|Bản án)/m, label: "header" },
  { pattern: /^(VỀ VỤ ÁN|Về vụ án)/m, label: "case_overview" },
  { pattern: /^(VỀ ÁN PHÍ|Về án phí)/m, label: "court_fees" },
  { pattern: /^(TUYÊN XỬ|Tuyên xử|TUYÊN BỐ|Tuyên bố)/m, label: "verdict" },
];

/** Rough token count */
function estimateTokens(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/** Extract case metadata from the document header */
function extractCaseMetadata(text: string): {
  caseNumber: string;
  court: string;
  caseType: string;
} {
  const result = { caseNumber: "", court: "", caseType: "" };

  // Case number: "Bản án số: 570/2025/HS-PT" or similar patterns
  const caseNumMatch = text.match(/[Ss]ố[:\s]*(\d+\/\d+\/[\w-]+)/);
  if (caseNumMatch) {
    result.caseNumber = caseNumMatch[1];
  }

  // Court: often in the first few lines, e.g. "TÒA ÁN NHÂN DÂN CẤP CAO TẠI HÀ NỘI"
  const courtMatch = text.match(/(TÒA ÁN NHÂN DÂN[^\n]+)/i);
  if (courtMatch) {
    result.court = courtMatch[1].trim();
  }

  // Case type from the case number pattern
  const typeMatch = result.caseNumber.match(/\/(HS|DS|HC|KT|LĐ)-/);
  if (typeMatch) {
    const typeMap: Record<string, string> = {
      HS: "Hình sự",
      DS: "Dân sự",
      HC: "Hành chính",
      KT: "Kinh tế",
      LĐ: "Lao động",
    };
    result.caseType = typeMap[typeMatch[1]] || typeMatch[1];
  }

  return result;
}

/** Split text into sentence-boundary-aware chunks with overlap */
function splitWithOverlap(
  text: string,
  maxTokens: number = 1000,
  overlapTokens: number = 100,
): string[] {
  const tokens = estimateTokens(text);
  if (tokens <= maxTokens) {
    return [text];
  }

  // Split on sentence boundaries (Vietnamese uses . and ;)
  const sentences = text.split(/(?<=[.;!?])\s+/);
  const splits: string[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sentTokens = estimateTokens(sentence);

    if (currentTokens + sentTokens > maxTokens && currentChunk.length > 0) {
      splits.push(currentChunk.join(" "));

      // Keep overlap: take sentences from the end of the current chunk
      const overlapChunk: string[] = [];
      let overlapCount = 0;
      for (let i = currentChunk.length - 1; i >= 0; i--) {
        const t = estimateTokens(currentChunk[i]);
        if (overlapCount + t > overlapTokens) break;
        overlapChunk.unshift(currentChunk[i]);
        overlapCount += t;
      }

      currentChunk = [...overlapChunk, sentence];
      currentTokens = overlapCount + sentTokens;
    } else {
      currentChunk.push(sentence);
      currentTokens += sentTokens;
    }
  }

  if (currentChunk.length > 0) {
    splits.push(currentChunk.join(" "));
  }

  return splits;
}

interface SectionBlock {
  label: string;
  content: string;
  startIndex: number;
}

/**
 * Parse a single precedent file into section-level chunks.
 */
export function parsePrecedentFile(filePath: string): Chunk[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const docName = path.basename(filePath, path.extname(filePath));
  const caseMeta = extractCaseMetadata(content);

  // Find all section boundaries
  const sectionBoundaries: { label: string; index: number }[] = [];

  for (const marker of SECTION_MARKERS) {
    const match = content.match(marker.pattern);
    if (match && match.index !== undefined) {
      sectionBoundaries.push({ label: marker.label, index: match.index });
    }
  }

  // Sort by position in document
  sectionBoundaries.sort((a, b) => a.index - b.index);

  // Build section blocks
  const sections: SectionBlock[] = [];

  if (sectionBoundaries.length === 0) {
    // No recognizable sections: treat entire document as one block
    sections.push({
      label: "full_document",
      content: content.trim(),
      startIndex: 0,
    });
  } else {
    // Content before the first section marker
    if (sectionBoundaries[0].index > 0) {
      const headerContent = content.slice(0, sectionBoundaries[0].index).trim();
      if (estimateTokens(headerContent) > 30) {
        sections.push({
          label: "header",
          content: headerContent,
          startIndex: 0,
        });
      }
    }

    // Each section
    for (let i = 0; i < sectionBoundaries.length; i++) {
      const start = sectionBoundaries[i].index;
      const end =
        i + 1 < sectionBoundaries.length
          ? sectionBoundaries[i + 1].index
          : content.length;

      const sectionContent = content.slice(start, end).trim();
      if (estimateTokens(sectionContent) > 20) {
        sections.push({
          label: sectionBoundaries[i].label,
          content: sectionContent,
          startIndex: start,
        });
      }
    }
  }

  // Convert sections to chunks (with recursive splitting for large sections)
  const chunks: Chunk[] = [];

  for (const section of sections) {
    const splits = splitWithOverlap(section.content, 1000, 100);

    for (let i = 0; i < splits.length; i++) {
      const chunkIndex = chunks.length;
      const sectionLabel =
        splits.length > 1 ? `${section.label}_part${i + 1}` : section.label;

      const metadata: PrecedentMetadata = {
        source_type: "precedent",
        document_name: docName,
        case_number: caseMeta.caseNumber,
        section: sectionLabel,
        chunk_index: chunkIndex,
      };

      if (caseMeta.court) metadata.court = caseMeta.court;
      if (caseMeta.caseType) metadata.case_type = caseMeta.caseType;

      chunks.push({
        id: `precedent:${docName}:${sectionLabel}:${chunkIndex}`,
        text: splits[i],
        metadata,
      });
    }
  }

  return chunks;
}

/**
 * Parse all precedent files from a directory.
 */
export function parseAllPrecedents(precedentsDir: string): Chunk[] {
  const files = fs
    .readdirSync(precedentsDir)
    .filter((f) => f.endsWith(".txt"))
    .sort();

  const allChunks: Chunk[] = [];

  for (const file of files) {
    const filePath = path.join(precedentsDir, file);
    console.log(`  ⚖️  Parsing precedent: ${file}`);
    const chunks = parsePrecedentFile(filePath);
    console.log(`     → ${chunks.length} chunks`);
    allChunks.push(...chunks);
  }

  return allChunks;
}
