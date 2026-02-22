/**
 * Law Parser — Article-level chunking for Vietnamese legal texts
 *
 * Strategy:
 *   - Split on "Điều \d+" boundaries (Vietnamese article markers)
 *   - Track parent Chương (chapter) and Mục (section) as context
 *   - Merge articles < 100 tokens with the next article
 *   - Each chunk = article content prefixed with chapter/section context
 */

import * as fs from "fs";
import * as path from "path";
import { Chunk, LawMetadata } from "../types";

/** Regex patterns for Vietnamese legal structure */
const CHAPTER_REGEX = /^(Chương\s+[IVXLCDM\d]+)\s*[.\-–:]*\s*(.*)$/im;
const SECTION_REGEX = /^(Mục\s+\d+)\s*[.\-–:]*\s*(.*)$/im;
const ARTICLE_REGEX = /^(Điều\s+\d+)\s*[.\-–:]*\s*(.*)$/im;

/** Rough token count (Vietnamese text: ~1 token per word/syllable) */
function estimateTokens(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/** Make a deterministic chunk ID */
function makeChunkId(docName: string, article: string): string {
  const cleanArticle = article.replace(/\s+/g, "_").toLowerCase();
  return `law:${docName}:${cleanArticle}`;
}

/** Extract document title from the first few lines of the text */
function extractDocumentTitle(text: string): string {
  const lines = text.split("\n").slice(0, 20);
  // Look for common title patterns in Vietnamese legal docs
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 10 && trimmed.length < 200) {
      // Look for law title patterns like "LUẬT", "BỘ LUẬT", "NGHỊ ĐỊNH"
      if (/^(LUẬT|BỘ LUẬT|NGHỊ ĐỊNH|THÔNG TƯ|QUYẾT ĐỊNH)/i.test(trimmed)) {
        return trimmed;
      }
    }
  }
  return "";
}

interface ArticleBlock {
  article: string;
  articleTitle: string;
  content: string;
  chapter: string;
  chapterTitle: string;
  section: string;
  sectionTitle: string;
}

/**
 * Parse a single law file into article-level chunks.
 */
export function parseLawFile(filePath: string): Chunk[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const docName = path.basename(filePath, path.extname(filePath));
  const docTitle = extractDocumentTitle(content);

  const lines = content.split("\n");
  const blocks: ArticleBlock[] = [];

  let currentChapter = "";
  let currentChapterTitle = "";
  let currentSection = "";
  let currentSectionTitle = "";
  let currentArticle = "";
  let currentArticleTitle = "";
  let currentContent: string[] = [];
  let preambleContent: string[] = [];
  let inArticle = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for chapter header
    const chapterMatch = trimmed.match(CHAPTER_REGEX);
    if (chapterMatch) {
      currentChapter = chapterMatch[1].trim();
      currentChapterTitle = chapterMatch[2]?.trim() || "";
      // Reset section when entering new chapter
      currentSection = "";
      currentSectionTitle = "";
      continue;
    }

    // Check for section header
    const sectionMatch = trimmed.match(SECTION_REGEX);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      currentSectionTitle = sectionMatch[2]?.trim() || "";
      continue;
    }

    // Check for article header
    const articleMatch = trimmed.match(ARTICLE_REGEX);
    if (articleMatch) {
      // Save previous article block
      if (inArticle && currentContent.length > 0) {
        blocks.push({
          article: currentArticle,
          articleTitle: currentArticleTitle,
          content: currentContent.join("\n").trim(),
          chapter: currentChapter,
          chapterTitle: currentChapterTitle,
          section: currentSection,
          sectionTitle: currentSectionTitle,
        });
      }

      currentArticle = articleMatch[1].trim();
      currentArticleTitle = articleMatch[2]?.trim() || "";
      currentContent = [trimmed]; // Include the article header line
      inArticle = true;
      continue;
    }

    // Accumulate content
    if (inArticle) {
      currentContent.push(line);
    } else {
      preambleContent.push(line);
    }
  }

  // Don't forget the last article
  if (inArticle && currentContent.length > 0) {
    blocks.push({
      article: currentArticle,
      articleTitle: currentArticleTitle,
      content: currentContent.join("\n").trim(),
      chapter: currentChapter,
      chapterTitle: currentChapterTitle,
      section: currentSection,
      sectionTitle: currentSectionTitle,
    });
  }

  // Add preamble as its own chunk if it has meaningful content
  const preambleText = preambleContent.join("\n").trim();
  const chunks: Chunk[] = [];

  if (estimateTokens(preambleText) > 50) {
    chunks.push({
      id: `law:${docName}:preamble`,
      text: preambleText,
      metadata: {
        source_type: "law",
        document_name: docName,
        document_title: docTitle,
        article: "Phần mở đầu",
        article_title: "Lời nói đầu / Preamble",
      },
    });
  }

  // Convert blocks to chunks, merging small ones
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    let text = block.content;

    // Build context prefix: chapter + section headers
    const contextParts: string[] = [];
    if (block.chapter) {
      contextParts.push(
        `${block.chapter}${block.chapterTitle ? ": " + block.chapterTitle : ""}`,
      );
    }
    if (block.section) {
      contextParts.push(
        `${block.section}${block.sectionTitle ? ": " + block.sectionTitle : ""}`,
      );
    }
    const contextPrefix =
      contextParts.length > 0 ? contextParts.join(" > ") + "\n\n" : "";

    // Merge small articles with the next one
    if (estimateTokens(text) < 100 && i + 1 < blocks.length) {
      const nextBlock = blocks[i + 1];
      blocks[i + 1] = {
        ...nextBlock,
        content: text + "\n\n" + nextBlock.content,
        article: block.article + " & " + nextBlock.article,
        articleTitle: block.articleTitle || nextBlock.articleTitle,
      };
      continue; // Skip this chunk, it's merged into the next
    }

    const fullText = contextPrefix + text;

    const metadata: LawMetadata = {
      source_type: "law",
      document_name: docName,
      document_title: docTitle,
      article: block.article,
    };

    if (block.articleTitle) metadata.article_title = block.articleTitle;
    if (block.chapter) metadata.chapter = block.chapter;
    if (block.chapterTitle) metadata.chapter_title = block.chapterTitle;
    if (block.section) metadata.section = block.section;
    if (block.sectionTitle) metadata.section_title = block.sectionTitle;

    chunks.push({
      id: makeChunkId(docName, block.article),
      text: fullText,
      metadata,
    });
  }

  return chunks;
}

/**
 * Parse all law files from a directory.
 */
export function parseAllLaws(lawsDir: string): Chunk[] {
  const files = fs
    .readdirSync(lawsDir)
    .filter((f) => f.endsWith(".txt"))
    .sort();

  const allChunks: Chunk[] = [];

  for (const file of files) {
    const filePath = path.join(lawsDir, file);
    console.log(`  📜 Parsing law: ${file}`);
    const chunks = parseLawFile(filePath);
    console.log(`     → ${chunks.length} chunks`);
    allChunks.push(...chunks);
  }

  return allChunks;
}
