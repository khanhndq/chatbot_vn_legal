import { createClient, RedisClientType } from 'redis';
import { config } from '../common/config';

export interface ChatbotResponse {
  response: string;
  confidence: number;
  timestamp: number;
}

export interface SessionData {
  sessionId: string;
  lastMessage: string;
  context: string[];
  createdAt: number;
}

export class RedisService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      password: config.redis.password || undefined,
    });

    this.setupEventHandlers();
    this.connect();
  }

  /**
   * Setup Redis client event handlers
   */
  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      console.log('🔌 Redis client connected');
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      console.log('✅ Redis client ready');
    });

    this.client.on('error', (err) => {
      console.error('❌ Redis client error:', err);
      this.isConnected = false;
    });

    this.client.on('end', () => {
      console.log('🔌 Redis client disconnected');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.log('🔄 Redis client reconnecting...');
    });
  }

  /**
   * Connect to Redis
   */
  private async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Check if Redis is connected
   */
  public isRedisConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Store chatbot response in cache
   */
  public async cacheChatbotResponse(
    query: string, 
    response: ChatbotResponse, 
    ttl: number = 3600
  ): Promise<void> {
    try {
      const key = `chatbot:response:${this.hashQuery(query)}`;
      await this.client.setEx(key, ttl, JSON.stringify(response));
    } catch (error) {
      console.error('❌ Failed to cache chatbot response:', error);
      // Don't throw as caching is not critical
    }
  }

  /**
   * Get cached chatbot response
   */
  public async getCachedResponse(query: string): Promise<ChatbotResponse | null> {
    try {
      const key = `chatbot:response:${this.hashQuery(query)}`;
      const cached = await this.client.get(key);
      
      if (cached) {
        return JSON.parse(cached) as ChatbotResponse;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to get cached response:', error);
      return null;
    }
  }

  /**
   * Store session data
   */
  public async storeSessionData(sessionData: SessionData, ttl: number = 86400): Promise<void> {
    try {
      const key = `session:${sessionData.sessionId}`;
      await this.client.setEx(key, ttl, JSON.stringify(sessionData));
    } catch (error) {
      console.error('❌ Failed to store session data:', error);
      // Don't throw as session storage is not critical
    }
  }

  /**
   * Get session data
   */
  public async getSessionData(sessionId: string): Promise<SessionData | null> {
    try {
      const key = `session:${sessionId}`;
      const cached = await this.client.get(key);
      
      if (cached) {
        return JSON.parse(cached) as SessionData;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to get session data:', error);
      return null;
    }
  }

  /**
   * Update session context
   */
  public async updateSessionContext(
    sessionId: string, 
    context: string[], 
    ttl: number = 86400
  ): Promise<void> {
    try {
      const existingData = await this.getSessionData(sessionId);
      if (existingData) {
        existingData.context = context;
        existingData.lastMessage = context[context.length - 1] || '';
        await this.storeSessionData(existingData, ttl);
      }
    } catch (error) {
      console.error('❌ Failed to update session context:', error);
      // Don't throw as context update is not critical
    }
  }

  /**
   * Store active WebSocket connections
   */
  public async storeActiveConnection(
    sessionId: string, 
    connectionId: string, 
    ttl: number = 300
  ): Promise<void> {
    try {
      const key = `connection:${sessionId}`;
      await this.client.setEx(key, ttl, connectionId);
    } catch (error) {
      console.error('❌ Failed to store active connection:', error);
      // Don't throw as connection tracking is not critical
    }
  }

  /**
   * Get active connection for a session
   */
  public async getActiveConnection(sessionId: string): Promise<string | null> {
    try {
      const key = `connection:${sessionId}`;
      return await this.client.get(key);
    } catch (error) {
      console.error('❌ Failed to get active connection:', error);
      return null;
    }
  }

  /**
   * Remove active connection
   */
  public async removeActiveConnection(sessionId: string): Promise<void> {
    try {
      const key = `connection:${sessionId}`;
      await this.client.del(key);
    } catch (error) {
      console.error('❌ Failed to remove active connection:', error);
      // Don't throw as connection cleanup is not critical
    }
  }

  /**
   * Get Redis statistics
   */
  public async getStats(): Promise<Record<string, any>> {
    try {
      const info = await this.client.info();
      
      return {
        info: info.split('\r\n').reduce((acc: any, line) => {
          if (line.includes(':')) {
            const [key, value] = line.split(':');
            acc[key] = value;
          }
          return acc;
        }, {}),
        connected: this.isConnected
      };
    } catch (error) {
      console.error('❌ Failed to get Redis stats:', error);
      return { error: 'Failed to get stats', connected: this.isConnected };
    }
  }

  /**
   * Simple hash function for query strings
   */
  private hashQuery(query: string): string {
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Close Redis connection
   */
  public async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch (error) {
      console.error('❌ Failed to close Redis connection:', error);
    }
  }

  /**
   * Test Redis connection
   */
  public async testConnection(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      console.error('❌ Redis connection test failed:', error);
      return false;
    }
  }
}
