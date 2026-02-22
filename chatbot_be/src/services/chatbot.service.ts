import { v4 as uuidv4 } from 'uuid';
import { RedisService, ChatbotResponse, SessionData } from './redis.service';
import { OpenAIService, ChatCompletionMessage, OpenAIMessage } from './open-ai.service';
import { chatbotTools, chatbotToolExecutor } from '../common/functions';
import { config } from '../common/config';
import { SYSTEM_PROMPT } from '../common/prompt';

export interface ChatMessage {
  id: string;
  sessionId: string;
  userMessage: string;
  botResponse: string;
  timestamp: Date;
}

export interface ChatbotConfig {
  defaultResponse: string;
  maxContextLength: number;
  responseDelay: number;
  systemPrompt: string;
  useOpenAI: boolean;
  useTools: boolean;
}

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: Error) => void;
}

export class ChatbotService {
  private redisService: RedisService;
  private openAIService: OpenAIService | null = null;
  private config: ChatbotConfig;

  constructor(redisService: RedisService) {
    this.redisService = redisService;
    this.config = {
      defaultResponse: "I'm here to help! How can I assist you today?",
      maxContextLength: 10,
      responseDelay: 1000,
      systemPrompt: SYSTEM_PROMPT,
      useOpenAI: config.openai.useOpenAI,
      useTools: config.openai.useTools
    };

    // Initialize OpenAI service if enabled
    if (this.config.useOpenAI) {
      try {
        this.openAIService = new OpenAIService();
        console.log('✅ ChatbotService initialized with OpenAI');
        if (this.config.useTools) {
          console.log('🔧 Tool calling enabled with FAQ tool');
        }
      } catch (error) {
        console.error('❌ Failed to initialize OpenAI, falling back to simple responses:', error);
        this.config.useOpenAI = false;
      }
    } else {
      console.log('ℹ️ ChatbotService initialized without OpenAI (set USE_OPENAI=true to enable)');
    }
  }

  /**
   * Process user message and generate bot response
   */
  public async processMessage(
    sessionId: string, 
    userMessage: string
  ): Promise<ChatMessage> {
    try {
      // Check for cached response first
      const cachedResponse = await this.redisService.getCachedResponse(userMessage);
      
      let botResponse: string;
      let confidence: number;

      if (cachedResponse) {
        botResponse = cachedResponse.response;
        confidence = cachedResponse.confidence;
        console.log(`📋 Using cached response for: "${userMessage}"`);
      } else {
        // Generate new response
        const response = await this.generateResponse(userMessage, sessionId);
        botResponse = response.response;
        confidence = response.confidence;

        // Cache the response
        await this.redisService.cacheChatbotResponse(userMessage, response);
      }

      // Update session context
      await this.updateSessionContext(sessionId, userMessage);

      // Create chat message
      const chatMessage: ChatMessage = {
        id: uuidv4(),
        sessionId,
        userMessage,
        botResponse,
        timestamp: new Date()
      };

      return chatMessage;
    } catch (error) {
      console.error('❌ Failed to process message:', error);
      
      // Return fallback response
      return {
        id: uuidv4(),
        sessionId,
        userMessage,
        botResponse: this.config.defaultResponse,
        timestamp: new Date()
      };
    }
  }

  /**
   * Generate chatbot response based on user message
   */
  private async generateResponse(
    userMessage: string,
    sessionId: string
  ): Promise<ChatbotResponse> {
    // Get session context for more contextual responses
    const sessionData = await this.redisService.getSessionData(sessionId);
    const context = sessionData?.context || [];

    // Use OpenAI if enabled and available
    if (this.config.useOpenAI && this.openAIService) {
      try {
        // Use tools with required tool choice if enabled
        if (this.config.useTools) {
          const messages = this.buildConversationHistoryForTools(context, userMessage);
          const response = await this.openAIService.runWithTools(
            messages,
            chatbotTools,
            chatbotToolExecutor,
            {
              toolChoice: 'required', // Force tool use
              maxToolCalls: 3
            }
          );

          return {
            response: response.content,
            confidence: 1.0,
            timestamp: Date.now()
          };
        }

        // Regular chat without tools
        const messages = this.buildConversationHistory(context, userMessage);
        const response = await this.openAIService.chat(messages);

        return {
          response: response.content,
          confidence: 1.0,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('❌ OpenAI request failed, falling back to simple response:', error);
      }
    }

    // Fallback to simple response logic
    const response = this.generateSimpleResponse(userMessage, context);

    return {
      response: response.text,
      confidence: response.confidence,
      timestamp: Date.now()
    };
  }

  /**
   * Build conversation history for OpenAI with tools (uses OpenAIMessage type)
   */
  private buildConversationHistoryForTools(context: string[], userMessage: string): OpenAIMessage[] {
    const messages: OpenAIMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT }
    ];

    // Add context as previous messages (alternating user/assistant)
    context.forEach((msg, index) => {
      messages.push({
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: msg
      });
    });

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  /**
   * Process message with streaming response
   */
  public async processMessageStream(
    sessionId: string,
    userMessage: string,
    callbacks: StreamCallbacks
  ): Promise<ChatMessage> {
    const messageId = uuidv4();
    const timestamp = new Date();

    try {
      // Get session context
      const sessionData = await this.redisService.getSessionData(sessionId);
      const context = sessionData?.context || [];

      let fullResponse = '';

      if (this.config.useOpenAI && this.openAIService) {
        // Use streaming with tools if enabled
        if (this.config.useTools) {
          const messages = this.buildConversationHistoryForTools(context, userMessage);

          const result = await this.openAIService.streamChatWithTools(
            messages,
            chatbotTools,
            chatbotToolExecutor,
            (chunk: string) => {
              fullResponse += chunk;
              callbacks.onChunk(chunk);
            },
            {
              toolChoice: 'required', // Force tool use
              maxToolCalls: 3
            }
          );

          fullResponse = result.content;
        } else {
          // Stream response from OpenAI without tools
          const messages = this.buildConversationHistory(context, userMessage);

          const result = await this.openAIService.streamChat(
            messages,
            (chunk: string) => {
              fullResponse += chunk;
              callbacks.onChunk(chunk);
            }
          );

          fullResponse = result.content;
        }
      } else {
        // Fallback: simulate streaming with simple response
        const simpleResponse = this.generateSimpleResponse(userMessage, context);
        fullResponse = simpleResponse.text;

        // Simulate streaming by sending word by word
        const words = fullResponse.split(' ');
        for (const word of words) {
          callbacks.onChunk(word + ' ');
          await this.delay(50); // Small delay between words
        }
      }

      // Update session context
      await this.updateSessionContext(sessionId, userMessage);

      // Create chat message
      const chatMessage: ChatMessage = {
        id: messageId,
        sessionId,
        userMessage,
        botResponse: fullResponse,
        timestamp
      };

      callbacks.onComplete(fullResponse);
      return chatMessage;
    } catch (error) {
      console.error('❌ Failed to process streaming message:', error);
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));

      // Return fallback response
      return {
        id: messageId,
        sessionId,
        userMessage,
        botResponse: this.config.defaultResponse,
        timestamp
      };
    }
  }

  /**
   * Build conversation history for OpenAI
   */
  private buildConversationHistory(context: string[], userMessage: string): ChatCompletionMessage[] {
    const messages: ChatCompletionMessage[] = [
      { role: 'system', content: this.config.systemPrompt }
    ];

    // Add context as previous messages (alternating user/assistant)
    context.forEach((msg, index) => {
      messages.push({
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: msg
      });
    });

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate simple response based on message content
   */
  private generateSimpleResponse(
    message: string, 
    context: string[]
  ): { text: string; confidence: number } {
    const lowerMessage = message.toLowerCase().trim();
    
    // Greeting patterns
    if (this.matchesPattern(lowerMessage, ['hello', 'hi', 'hey', 'good morning', 'good afternoon'])) {
      return {
        text: this.getRandomResponse([
          "Hello! How can I help you today?",
          "Hi there! What would you like to know?",
          "Hey! I'm here to assist you.",
          "Greetings! How may I be of service?"
        ]),
        confidence: 0.9
      };
    }

    // Help patterns
    if (this.matchesPattern(lowerMessage, ['help', 'support', 'assist', 'guide'])) {
      return {
        text: "I'm here to help! I can answer questions, provide information, or just chat with you. What would you like to know?",
        confidence: 0.8
      };
    }

    // Question patterns
    if (this.matchesPattern(lowerMessage, ['what', 'how', 'why', 'when', 'where', 'who'])) {
      return {
        text: "That's an interesting question! I'm still learning, but I'll do my best to help. Could you provide more context?",
        confidence: 0.7
      };
    }

    // Thank you patterns
    if (this.matchesPattern(lowerMessage, ['thank', 'thanks', 'appreciate', 'grateful'])) {
      return {
        text: this.getRandomResponse([
          "You're welcome! I'm glad I could help.",
          "No problem at all! Is there anything else you'd like to know?",
          "My pleasure! Feel free to ask more questions.",
          "Anytime! I'm here whenever you need assistance."
        ]),
        confidence: 0.9
      };
    }

    // Goodbye patterns
    if (this.matchesPattern(lowerMessage, ['bye', 'goodbye', 'see you', 'farewell'])) {
      return {
        text: this.getRandomResponse([
          "Goodbye! It was nice chatting with you.",
          "See you later! Feel free to come back anytime.",
          "Take care! I'll be here when you return.",
          "Farewell! Have a great day!"
        ]),
        confidence: 0.9
      };
    }

    // Context-aware responses
    if (context.length > 0) {
      const lastMessage = context[context.length - 1].toLowerCase();
      
      // If user is asking for clarification
      if (this.matchesPattern(lowerMessage, ['what do you mean', 'explain', 'clarify'])) {
        return {
          text: "I understand you'd like me to clarify something. Could you be more specific about what you'd like me to explain?",
          confidence: 0.6
        };
      }

      // If user is repeating themselves
      if (this.isSimilarTo(lowerMessage, lastMessage)) {
        return {
          text: "I think you might have mentioned that before. Could you try rephrasing your question or ask something different?",
          confidence: 0.7
        };
      }
    }

    // Default response
    return {
      text: this.getRandomResponse([
        "That's interesting! Tell me more about that.",
        "I'm not sure I understand. Could you rephrase that?",
        "Interesting point! What makes you think that?",
        "I'd love to learn more about your perspective on this.",
        "That's a great question! Let me think about it...",
        "I'm here to help! Could you provide more details?"
      ]),
      confidence: 0.5
    };
  }

  /**
   * Check if message matches any patterns
   */
  private matchesPattern(message: string, patterns: string[]): boolean {
    return patterns.some(pattern => message.includes(pattern));
  }

  /**
   * Check if two messages are similar
   */
  private isSimilarTo(message1: string, message2: string): boolean {
    const words1 = message1.split(' ').filter(word => word.length > 3);
    const words2 = message2.split(' ').filter(word => word.length > 3);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);
    
    return similarity > 0.6;
  }

  /**
   * Get random response from array
   */
  private getRandomResponse(responses: string[]): string {
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Update session context with new message
   */
  private async updateSessionContext(sessionId: string, message: string): Promise<void> {
    try {
      const sessionData = await this.redisService.getSessionData(sessionId);
      let context: string[] = [];
      
      if (sessionData) {
        context = sessionData.context;
      }

      // Add new message to context
      context.push(message);

      // Limit context length
      if (context.length > this.config.maxContextLength) {
        context = context.slice(-this.config.maxContextLength);
      }

      // Update or create session data
      const newSessionData: SessionData = {
        sessionId,
        lastMessage: message,
        context,
        createdAt: sessionData?.createdAt || Date.now()
      };

      await this.redisService.storeSessionData(newSessionData);
    } catch (error) {
      console.error('❌ Failed to update session context:', error);
      // Don't throw as context update is not critical
    }
  }

  /**
   * Get chatbot statistics
   */
  public async getStats(): Promise<Record<string, any>> {
    try {
      const redisStats = await this.redisService.getStats();
      
      return {
        service: 'ChatbotService',
        config: this.config,
        redis: redisStats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to get chatbot stats:', error);
      return {
        service: 'ChatbotService',
        error: 'Failed to get stats',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Update chatbot configuration
   */
  public updateConfig(newConfig: Partial<ChatbotConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('✅ Chatbot configuration updated:', this.config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): ChatbotConfig {
    return { ...this.config };
  }
}
