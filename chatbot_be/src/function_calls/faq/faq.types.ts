// FAQ Types and Interfaces

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string;
}

export type FAQCategory = 'general' | 'support' | 'policies' | 'orders' | 'payments' | 'shipping' | 'account';

