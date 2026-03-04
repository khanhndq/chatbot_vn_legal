import { v4 as uuidv4 } from 'uuid';
import { RedisService, ChatbotResponse, SessionData } from './redis.service';
import { LLMMessage, LLMToolExecutor, LLMProviderType } from '../providers/types';
import { ILLMProvider } from '../providers/llm-provider.interface';
import { LLMFactory } from '../providers/llm-factory';
import { chatbotTools, chatbotToolExecutor } from '../common/functions';
import { config } from '../common/config';
import { SYSTEM_PROMPT } from '../common/prompt';

export interface SourceLink {
  title: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  userMessage: string;
  botResponse: string;
  timestamp: Date;
  sourceLinks?: SourceLink[];
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
  onComplete: (fullResponse: string, sourceLinks?: SourceLink[]) => void;
  onError: (error: Error) => void;
}

export class ChatbotService {
  private redisService: RedisService;
  private config: ChatbotConfig;

  constructor(redisService: RedisService) {
    this.redisService = redisService;
    this.config = {
      defaultResponse: "I'm here to help! How can I assist you today?",
      maxContextLength: 6,
      responseDelay: 1000,
      systemPrompt: SYSTEM_PROMPT,
      useOpenAI: config.openai.useOpenAI,
      useTools: config.openai.useTools
    };

    if (this.config.useOpenAI) {
      const available = LLMFactory.getAvailableProviders();
      console.log(`✅ ChatbotService initialized. Available LLM providers: ${available.join(', ')}`);
      if (this.config.useTools) {
        console.log('🔧 Tool calling enabled');
      }
    } else {
      console.log('ℹ️ ChatbotService initialized without LLM (set USE_OPENAI=true to enable)');
    }
  }

  /**
   * Get an LLM provider by type, falling back to the default.
   */
  private getProvider(providerType?: LLMProviderType): ILLMProvider {
    return LLMFactory.getProvider(providerType);
  }

  /**
   * Process user message and generate bot response
   */
  public async processMessage(
    sessionId: string,
    userMessage: string,
    providerType?: LLMProviderType
  ): Promise<ChatMessage> {
    try {
      // Check for cached response first (include provider in cache key)
      const cacheKey = providerType ? `${providerType}:${userMessage}` : userMessage;
      const cachedResponse = await this.redisService.getCachedResponse(cacheKey);

      let botResponse: string;
      let confidence: number;
      let sourceLinks: SourceLink[] | undefined;

      if (cachedResponse) {
        botResponse = cachedResponse.response;
        confidence = cachedResponse.confidence;
        console.log(`📋 Using cached response for: "${userMessage}" [${providerType || 'default'}]`);
      } else {
        // Generate new response
        const response = await this.generateResponse(userMessage, sessionId, providerType);
        botResponse = response.response;
        confidence = response.confidence;
        sourceLinks = response.sourceLinks;

        // Cache the response
        await this.redisService.cacheChatbotResponse(cacheKey, response);
      }

      // Update session context
      await this.updateSessionContext(sessionId, userMessage);

      // Create chat message
      const chatMessage: ChatMessage = {
        id: uuidv4(),
        sessionId,
        userMessage,
        botResponse,
        timestamp: new Date(),
        sourceLinks
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
   * Extract source links from raw tool result JSON strings.
   */
  private extractSourceLinks(toolResults: string[]): SourceLink[] {
    const linksMap = new Map<string, SourceLink>();

    for (const raw of toolResults) {
      try {
        const parsed = JSON.parse(raw);
        if (!parsed.found) continue;

        const sections = [parsed.legal_provisions, parsed.case_precedents];
        for (const section of sections) {
          if (!section?.results) continue;
          for (const r of section.results) {
            if (r.link && typeof r.link === 'string') {
              const title = r.document_title || r.document_name || r.link;
              if (!linksMap.has(r.link)) {
                linksMap.set(r.link, { title, url: r.link });
              }
            }
          }
        }
      } catch {
        // Not valid JSON or not a legal tool result — skip
      }
    }

    return Array.from(linksMap.values());
  }

  /**
   * Create a wrapper around the tool executor that captures raw result strings.
   */
  private createCapturingExecutor(): { executor: LLMToolExecutor; results: string[] } {
    const results: string[] = [];
    const executor: LLMToolExecutor = async (name, args) => {
      const result = await chatbotToolExecutor(name, args);
      results.push(result);
      return result;
    };
    return { executor, results };
  }

  /**
   * Generate chatbot response based on user message
   */
  private async generateResponse(
    userMessage: string,
    sessionId: string,
    providerType?: LLMProviderType
  ): Promise<ChatbotResponse & { sourceLinks?: SourceLink[] }> {
    // Get session context for more contextual responses
    const sessionData = await this.redisService.getSessionData(sessionId);
    const context = sessionData?.context || [];

    // Use LLM if enabled
    if (this.config.useOpenAI) {
      try {
        const provider = this.getProvider(providerType);

        // Use tools with required tool choice if enabled
        if (this.config.useTools) {
          const messages = this.buildConversationHistory(context, userMessage);
          const { executor, results } = this.createCapturingExecutor();
          const response = await provider.runWithTools(
            messages,
            chatbotTools,
            executor,
            {
              toolChoice: 'required',
              maxToolCalls: 3
            }
          );

          const sourceLinks = this.extractSourceLinks(results);

          return {
            response: response.content,
            confidence: 1.0,
            timestamp: Date.now(),
            sourceLinks: sourceLinks.length > 0 ? sourceLinks : undefined
          };
        }

        // Regular chat without tools
        const messages = this.buildConversationHistory(context, userMessage);
        const response = await provider.chat(messages);

        return {
          response: response.content,
          confidence: 1.0,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error(`❌ LLM request failed (${providerType || 'default'}), falling back to simple response:`, error);
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
   * Process message with streaming response
   */
  public async processMessageStream(
    sessionId: string,
    userMessage: string,
    callbacks: StreamCallbacks,
    providerType?: LLMProviderType
  ): Promise<ChatMessage> {
    const messageId = uuidv4();
    const timestamp = new Date();

    try {
      // Get session context
      const sessionData = await this.redisService.getSessionData(sessionId);
      const context = sessionData?.context || [];

      let fullResponse = '';
      let sourceLinks: SourceLink[] | undefined;

      if (this.config.useOpenAI) {
        const provider = this.getProvider(providerType);

        // Use streaming with tools if enabled
        if (this.config.useTools) {
          const messages = this.buildConversationHistory(context, userMessage);
          const { executor, results } = this.createCapturingExecutor();

          const result = await provider.streamChatWithTools(
            messages,
            chatbotTools,
            executor,
            (chunk: string) => {
              fullResponse += chunk;
              callbacks.onChunk(chunk);
            },
            {
              toolChoice: 'required',
              maxToolCalls: 3
            }
          );

          fullResponse = result.content;
          const extracted = this.extractSourceLinks(results);
          sourceLinks = extracted.length > 0 ? extracted : undefined;
        } else {
          // Stream response without tools
          const messages = this.buildConversationHistory(context, userMessage);

          const result = await provider.streamChat(
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
          await this.delay(50);
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
        timestamp,
        sourceLinks
      };

      callbacks.onComplete(fullResponse, sourceLinks);
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
   * Build conversation history as LLMMessage array
   */
  private buildConversationHistory(context: string[], userMessage: string): LLMMessage[] {
    const messages: LLMMessage[] = [
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

      if (this.matchesPattern(lowerMessage, ['what do you mean', 'explain', 'clarify'])) {
        return {
          text: "I understand you'd like me to clarify something. Could you be more specific about what you'd like me to explain?",
          confidence: 0.6
        };
      }

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

  private matchesPattern(message: string, patterns: string[]): boolean {
    return patterns.some(pattern => message.includes(pattern));
  }

  private isSimilarTo(message1: string, message2: string): boolean {
    const words1 = message1.split(' ').filter(word => word.length > 3);
    const words2 = message2.split(' ').filter(word => word.length > 3);

    const commonWords = words1.filter(word => words2.includes(word));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);

    return similarity > 0.6;
  }

  private getRandomResponse(responses: string[]): string {
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private async updateSessionContext(sessionId: string, message: string): Promise<void> {
    try {
      const sessionData = await this.redisService.getSessionData(sessionId);
      let context: string[] = [];

      if (sessionData) {
        context = sessionData.context;
      }

      context.push(message);

      if (context.length > this.config.maxContextLength) {
        context = context.slice(-this.config.maxContextLength);
      }

      const newSessionData: SessionData = {
        sessionId,
        lastMessage: message,
        context,
        createdAt: sessionData?.createdAt || Date.now()
      };

      await this.redisService.storeSessionData(newSessionData);
    } catch (error) {
      console.error('❌ Failed to update session context:', error);
    }
  }

  public async getStats(): Promise<Record<string, any>> {
    try {
      const redisStats = await this.redisService.getStats();

      return {
        service: 'ChatbotService',
        config: this.config,
        availableProviders: LLMFactory.getAvailableProviders(),
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

  public updateConfig(newConfig: Partial<ChatbotConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('✅ Chatbot configuration updated:', this.config);
  }

  public getConfig(): ChatbotConfig {
    return { ...this.config };
  }
}
