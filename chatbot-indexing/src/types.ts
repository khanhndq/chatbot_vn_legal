/**
 * Shared types for the chatbot-indexing pipeline
 */

/** A single chunk of text with metadata, ready for embedding and Pinecone upsert */
export interface Chunk {
  /** Deterministic ID: source_type:document_name:section_identifier */
  id: string;
  /** The text content to be embedded */
  text: string;
  /** Metadata attached to the Pinecone vector */
  metadata: ChunkMetadata;
}

/** Base metadata fields shared across all source types */
export interface BaseMetadata {
  source_type: "law" | "precedent" | "faq";
  document_name: string;
}

/** Metadata for law chunks */
export interface LawMetadata extends BaseMetadata {
  source_type: "law";
  document_title: string;
  chapter?: string;
  chapter_title?: string;
  section?: string;
  section_title?: string;
  article: string;
  article_title?: string;
}

/** Metadata for precedent chunks */
export interface PrecedentMetadata extends BaseMetadata {
  source_type: "precedent";
  case_number: string;
  court?: string;
  case_type?: string;
  section: string;
  chunk_index: number;
}

/** Metadata for FAQ chunks */
export interface FAQMetadata extends BaseMetadata {
  source_type: "faq";
  question: string;
  has_image: boolean;
  row_index: number;
}

/** Union type for all metadata variants */
export type ChunkMetadata = LawMetadata | PrecedentMetadata | FAQMetadata;

/** Configuration for the indexing pipeline */
export interface PipelineConfig {
  pineconeApiKey: string;
  pineconeIndex: string;
  openaiApiKey: string;
  embeddingModel: string;
  embeddingDimensions: number;
  batchSize: number;
  dryRun: boolean;
  rawDataDir: string;
  jsonOutputDir: string;
}

/** Stats from the indexing pipeline */
export interface PipelineStats {
  totalChunks: number;
  lawChunks: number;
  precedentChunks: number;
  faqChunks: number;
  embeddingsGenerated: number;
  vectorsUpserted: number;
  duration: number;
}
