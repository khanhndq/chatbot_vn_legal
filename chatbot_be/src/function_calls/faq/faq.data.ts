import { FAQItem } from './faq.types';

// FAQ Data - can be extended or loaded from database
export const FAQ_DATA: FAQItem[] = [
  {
    id: 'faq-1',
    question: 'What are your business hours?',
    answer: 'We are open Monday through Friday from 9:00 AM to 6:00 PM, and Saturday from 10:00 AM to 4:00 PM. We are closed on Sundays and public holidays.',
    keywords: ['hours', 'open', 'close', 'time', 'schedule', 'business hours', 'working hours'],
    category: 'general'
  },
  {
    id: 'faq-2',
    question: 'How can I contact customer support?',
    answer: 'You can reach our customer support team via email at support@example.com, by phone at 1-800-123-4567, or through our live chat on the website. Our support team is available during business hours.',
    keywords: ['contact', 'support', 'help', 'email', 'phone', 'customer service'],
    category: 'support'
  },
  {
    id: 'faq-3',
    question: 'What is your return policy?',
    answer: 'We offer a 30-day return policy for all unused items in their original packaging. To initiate a return, please contact our support team with your order number. Refunds are processed within 5-7 business days after we receive the returned item.',
    keywords: ['return', 'refund', 'exchange', 'money back', 'policy'],
    category: 'policies'
  },
  {
    id: 'faq-4',
    question: 'How do I track my order?',
    answer: 'Once your order is shipped, you will receive an email with a tracking number and a link to track your package. You can also log into your account on our website and view your order status under "My Orders".',
    keywords: ['track', 'order', 'shipping', 'delivery', 'status', 'where is my order'],
    category: 'orders'
  },
  {
    id: 'faq-5',
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit cards (Visa, MasterCard, American Express), PayPal, Apple Pay, Google Pay, and bank transfers. All transactions are secured with SSL encryption.',
    keywords: ['payment', 'pay', 'credit card', 'paypal', 'methods', 'how to pay'],
    category: 'payments'
  },
  {
    id: 'faq-6',
    question: 'Do you offer international shipping?',
    answer: 'Yes, we ship to over 50 countries worldwide. International shipping rates and delivery times vary by destination. You can see the shipping cost at checkout before completing your purchase.',
    keywords: ['international', 'shipping', 'worldwide', 'overseas', 'country', 'global'],
    category: 'shipping'
  },
  {
    id: 'faq-7',
    question: 'How do I create an account?',
    answer: 'Click the "Sign Up" button on the top right of our website. You can register using your email address or sign up with your Google or Facebook account. After registration, you will receive a confirmation email.',
    keywords: ['account', 'register', 'sign up', 'create account', 'new account'],
    category: 'account'
  },
  {
    id: 'faq-8',
    question: 'I forgot my password. How can I reset it?',
    answer: 'Click on "Forgot Password" on the login page. Enter your registered email address, and we will send you a link to reset your password. The link is valid for 24 hours.',
    keywords: ['password', 'forgot', 'reset', 'login', 'cannot login', 'locked out'],
    category: 'account'
  }
];

