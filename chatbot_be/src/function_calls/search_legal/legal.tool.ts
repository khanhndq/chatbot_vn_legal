import { LLMTool as Tool } from "../../providers/types";

/**
 * OpenAI function calling tool schema for search_legal.
 *
 * This tool searches the Vietnamese legal knowledge base (laws, precedents, FAQs)
 * stored in Pinecone to find relevant legal information.
 */
export const legalTool: Tool = {
  type: "function",
  function: {
    name: "search_legal",
    description:
      "Search the Vietnamese legal knowledge base for relevant laws, court precedents, and legal Q&A. " +
      "Use this tool when the user asks about Vietnamese labor law, social insurance, health insurance, " +
      "taxation, civil law, enterprise law, or any legal topic. Returns the most relevant legal text " +
      "passages with source citations. " +
      "IMPORTANT: The query MUST reflect only the user's CURRENT question. " +
      "If the user switches topics, form a completely new query — do NOT carry over keywords from previous topics.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The search query based on the user's CURRENT question only, in Vietnamese or English. " +
            "Do NOT include terms from previous conversation topics — extract keywords only from the latest message.",
        },
        source_type: {
          type: "string",
          description: "Optional filter to search only a specific source type",
          enum: ["law", "precedent", "faq"],
        },
        top_k: {
          type: "number",
          description: "Number of results to return (default: 5, max: 10)",
        },
      },
      required: ["query"],
    },
  },
};
