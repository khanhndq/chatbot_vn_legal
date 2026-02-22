/** Type definitions for the search_legal tool */

export interface LegalSearchResult {
  id: string;
  score: number;
  text: string;
  source_type: "law" | "precedent" | "faq";
  document_name: string;
  /** Extra metadata fields depending on source type */
  metadata: Record<string, string | number | boolean>;
}

export interface LegalSearchResponse {
  found: boolean;
  count: number;
  results: LegalSearchResult[];
  query: string;
  source_type_filter?: string;
}
