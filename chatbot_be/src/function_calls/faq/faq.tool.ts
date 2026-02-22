import { Tool } from '../../services/open-ai.service';

// FAQ Tool Definition
export const faqTool: Tool = {
  type: 'function',
  function: {
    name: 'search_faq',
    description: 'Search the FAQ database for answers to common questions. Use this tool when the user asks about business hours, support, returns, orders, payments, shipping, or account-related questions.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query or question from the user'
        },
        category: {
          type: 'string',
          description: 'Optional category to filter results',
          enum: ['general', 'support', 'policies', 'orders', 'payments', 'shipping', 'account']
        }
      },
      required: ['query']
    }
  }
};

