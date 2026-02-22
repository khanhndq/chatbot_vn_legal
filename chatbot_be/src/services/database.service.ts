import { Pool, QueryResult } from 'pg';
import { config } from '../common/config';

// Database table schemas
export interface Message {
  id: string;
  session_id: string;
  user_message: string;
  bot_response: string;
  timestamp: Date;
  created_at: Date;
}

export interface ChatSession {
  id: string;
  created_at: Date;
  last_activity: Date;
}

export class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  /**
   * Create a new chat session
   */
  public async createChatSession(sessionId: string): Promise<void> {
    const query = `
      INSERT INTO chat_sessions (id, created_at, last_activity)
      VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET last_activity = CURRENT_TIMESTAMP
    `;
    
    try {
      await this.pool.query(query, [sessionId]);
    } catch (error) {
      console.error('❌ Failed to create chat session:', error);
      throw error;
    }
  }

  /**
   * Store a message in the database
   */
  public async storeMessage(message: Omit<Message, 'created_at'>): Promise<void> {
    const query = `
      INSERT INTO messages (id, session_id, user_message, bot_response, timestamp, created_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `;
    
    try {
      await this.pool.query(query, [
        message.id,
        message.session_id,
        message.user_message,
        message.bot_response,
        message.timestamp
      ]);

      // Update session last activity
      await this.updateSessionActivity(message.session_id);
    } catch (error) {
      console.error('❌ Failed to store message:', error);
      throw error;
    }
  }

  /**
   * Get chat history for a session
   */
  public async getChatHistory(sessionId: string, limit: number = 50): Promise<Message[]> {
    const query = `
      SELECT id, session_id, user_message, bot_response, timestamp, created_at
      FROM messages
      WHERE session_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;
    
    try {
      const result: QueryResult<Message> = await this.pool.query(query, [sessionId, limit]);
      return result.rows.reverse(); // Return in chronological order
    } catch (error) {
      console.error('❌ Failed to get chat history:', error);
      throw error;
    }
  }

  /**
   * Update session last activity
   */
  private async updateSessionActivity(sessionId: string): Promise<void> {
    const query = `
      UPDATE chat_sessions 
      SET last_activity = CURRENT_TIMESTAMP 
      WHERE id = $1
    `;
    
    try {
      await this.pool.query(query, [sessionId]);
    } catch (error) {
      console.error('❌ Failed to update session activity:', error);
      // Don't throw here as this is not critical
    }
  }

  /**
   * Get all active sessions
   */
  public async getActiveSessions(): Promise<ChatSession[]> {
    const query = `
      SELECT id, created_at, last_activity
      FROM chat_sessions
      WHERE last_activity > CURRENT_TIMESTAMP - INTERVAL '24 hours'
      ORDER BY last_activity DESC
    `;
    
    try {
      const result: QueryResult<ChatSession> = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get active sessions:', error);
      throw error;
    }
  }

  /**
   * Clean up old sessions and messages
   */
  public async cleanupOldData(daysToKeep: number = 30): Promise<void> {
    try {
      const client = await this.pool.connect();
      
      // Delete old messages
      await client.query(`
        DELETE FROM messages 
        WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '${daysToKeep} days'
      `);

      // Delete old sessions
      await client.query(`
        DELETE FROM chat_sessions 
        WHERE last_activity < CURRENT_TIMESTAMP - INTERVAL '${daysToKeep} days'
      `);

      client.release();
      console.log(`🧹 Cleaned up data older than ${daysToKeep} days`);
    } catch (error) {
      console.error('❌ Failed to cleanup old data:', error);
      throw error;
    }
  }

  /**
   * Close database connection pool
   */
  public async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Test database connection
   */
  public async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      return true;
    } catch (error) {
      console.error('❌ Database connection test failed:', error);
      return false;
    }
  }
}
