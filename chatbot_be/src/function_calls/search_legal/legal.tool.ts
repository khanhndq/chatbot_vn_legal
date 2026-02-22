import { Tool } from "../../services/open-ai.service";

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
      "passages with source citations.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The search query or legal question from the user, in Vietnamese or English",
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
