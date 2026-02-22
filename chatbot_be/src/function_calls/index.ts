import { Tool, ToolExecutor } from "../services/open-ai.service";
import { faqTool, faqToolExecutor } from "./faq";
import { legalTool, legalToolExecutor } from "./search_legal";

// Export all function call modules
export * from "./faq";
export * from "./search_legal";

// All available tools (add new tools here as they are created)
export const chatbotTools: Tool[] = [
  legalTool, // Primary tool: search Vietnamese legal knowledge base
  faqTool, // Legacy: generic FAQ search (kept for backward compatibility)
  // Add more tools here...
];

// Combined tool executor for all chatbot tools
export const chatbotToolExecutor: ToolExecutor = async (
  name: string,
  args: Record<string, unknown>,
): Promise<string> => {
  switch (name) {
    case "search_legal":
      return legalToolExecutor(name, args);

    case "search_faq":
      return faqToolExecutor(name, args);

    // Add more tool cases here as new function calls are added

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};
