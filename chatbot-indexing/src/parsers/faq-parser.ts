/**
 * FAQ Parser — Row-level chunking for Vietnamese legal Q&A pairs
 *
 * Strategy:
 *   - Parse CSV with columns: question, answer, image
 *   - Each row → 1 chunk with concatenated "Q: ... \n\nA: ..." text
 *   - No splitting needed (each Q&A pair is already small)
 */

import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { Chunk, FAQMetadata } from "../types";

interface FAQRow {
  question: string;
  answer: string;
  image?: string;
}

/**
 * Parse the FAQ CSV file into row-level chunks.
 */
export function parseFAQFile(filePath: string): Chunk[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const docName = path.basename(filePath, path.extname(filePath));

  // Parse CSV
  const records: FAQRow[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  const chunks: Chunk[] = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];

    // Skip rows with empty question or answer
    if (!row.question?.trim() || !row.answer?.trim()) {
      continue;
    }

    const question = row.question.trim();
    const answer = row.answer.trim();
    const hasImage = !!(row.image && row.image.trim());

    // Concatenate Q&A as the chunk text
    const text = `Câu hỏi: ${question}\n\nTrả lời: ${answer}`;

    const metadata: FAQMetadata = {
      source_type: "faq",
      document_name: docName,
      question: question.substring(0, 200), // Truncate for metadata (Pinecone limit)
      has_image: hasImage,
      row_index: i,
    };

    chunks.push({
      id: `faq:${docName}:row_${i}`,
      text,
      metadata,
    });
  }

  return chunks;
}

/**
 * Parse all FAQ files from a directory.
 */
export function parseAllFAQs(faqDir: string): Chunk[] {
  const files = fs
    .readdirSync(faqDir)
    .filter((f) => f.endsWith(".csv"))
    .sort();

  const allChunks: Chunk[] = [];

  for (const file of files) {
    const filePath = path.join(faqDir, file);
    console.log(`  ❓ Parsing FAQ: ${file}`);
    const chunks = parseFAQFile(filePath);
    console.log(`     → ${chunks.length} chunks`);
    allChunks.push(...chunks);
  }

  return allChunks;
}
