import { ToolExecutor } from '../../services/open-ai.service';
import { FAQItem } from './faq.types';
import { FAQ_DATA } from './faq.data';

// FAQ Search Function
export function searchFAQ(query: string, category?: string): FAQItem[] {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/);

  let results = FAQ_DATA.filter(faq => {
    // Filter by category if provided
    if (category && faq.category !== category) {
      return false;
    }

    // Check if query matches keywords
    const keywordMatch = faq.keywords.some(keyword =>
      queryLower.includes(keyword.toLowerCase()) ||
      keyword.toLowerCase().includes(queryLower)
    );

    // Check if query words match keywords
    const wordMatch = queryWords.some(word =>
      word.length > 2 && faq.keywords.some(keyword =>
        keyword.toLowerCase().includes(word)
      )
    );

    // Check if query matches question
    const questionMatch = faq.question.toLowerCase().includes(queryLower) ||
      queryWords.some(word => word.length > 2 && faq.question.toLowerCase().includes(word));

    return keywordMatch || wordMatch || questionMatch;
  });

  // Sort by relevance (more keyword matches = higher rank)
  results.sort((a, b) => {
    const aScore = a.keywords.filter(k => queryLower.includes(k.toLowerCase())).length;
    const bScore = b.keywords.filter(k => queryLower.includes(k.toLowerCase())).length;
    return bScore - aScore;
  });

  return results.slice(0, 3); // Return top 3 matches
}

// Tool Executor for FAQ
export const faqToolExecutor: ToolExecutor = async (name: string, args: Record<string, unknown>): Promise<string> => {
  if (name === 'search_faq') {
    const query = args.query as string;
    const category = args.category as string | undefined;

    console.log(`🔍 Searching FAQ for: "${query}"${category ? ` in category: ${category}` : ''}`);

    const results = searchFAQ(query, category);

    if (results.length === 0) {
      return JSON.stringify({
        found: false,
        message: 'No matching FAQ entries found for this query.',
        suggestion: 'The user may need to contact customer support for this question.'
      });
    }

    return JSON.stringify({
      found: true,
      count: results.length,
      results: results.map(faq => ({
        question: faq.question,
        answer: faq.answer,
        category: faq.category
      }))
    });
  }

  throw new Error(`Unknown tool: ${name}`);
};

