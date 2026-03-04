import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/database.service';
import { ChatbotService } from '../services/chatbot.service';
import { RedisService } from '../services/redis.service';
import { LLMFactory } from '../providers/llm-factory';
import { config } from '../common/config';

const router = Router();

// Initialize services
const databaseService = new DatabaseService();
const redisService = new RedisService();
const chatbotService = new ChatbotService(redisService);

/**
 * @route GET /api/messages/health
 * @desc Check message service health
 * @access Public
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const dbHealth = await databaseService.testConnection();
    const redisHealth = await redisService.testConnection();
    
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealth ? 'connected' : 'disconnected',
        redis: redisHealth ? 'connected' : 'disconnected'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: 'Failed to check service health'
    });
  }
});

/**
 * @route GET /api/messages/history/:sessionId
 * @desc Get chat history for a specific session
 * @access Public
 */
router.get('/history/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    
    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required',
        timestamp: new Date().toISOString()
      });
    }

    const chatHistory = await databaseService.getChatHistory(sessionId, limit);
    
    res.status(200).json({
      success: true,
      sessionId,
      messageCount: chatHistory.length,
      messages: chatHistory,
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    console.error('❌ Failed to get chat history:', error);
    res.status(500).json({
      error: 'Failed to retrieve chat history',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

/**
 * @route POST /api/messages/send
 * @desc Send a message and get bot response (alternative to WebSocket)
 * @access Public
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { sessionId, message, model } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({
        error: 'Session ID and message are required',
        timestamp: new Date().toISOString()
      });
    }

    // Process message through chatbot
    const chatMessage = await chatbotService.processMessage(sessionId, message, model);
    
    // Store message in database
    const dbMessage = {
      session_id: sessionId,
      user_message: chatMessage.userMessage,
      bot_response: chatMessage.botResponse,
      timestamp: chatMessage.timestamp
    };
    
    await databaseService.storeMessage({
      ...dbMessage,
      id: chatMessage.id
    });

    res.status(200).json({
      success: true,
      messageId: chatMessage.id,
      sessionId,
      userMessage: chatMessage.userMessage,
      botResponse: chatMessage.botResponse,
      timestamp: chatMessage.timestamp
    });
    return;
  } catch (error) {
    console.error('❌ Failed to send message:', error);
    res.status(500).json({
      error: 'Failed to process message',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

/**
 * @route GET /api/messages/sessions
 * @desc Get all active chat sessions
 * @access Public
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const activeSessions = await databaseService.getActiveSessions();
    
    res.status(200).json({
      success: true,
      sessionCount: activeSessions.length,
      sessions: activeSessions,
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    console.error('❌ Failed to get active sessions:', error);
    res.status(500).json({
      error: 'Failed to retrieve active sessions',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

/**
 * @route POST /api/messages/sessions
 * @desc Create a new chat session
 * @access Public
 */
router.post('/sessions', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required',
        timestamp: new Date().toISOString()
      });
    }

    await databaseService.createChatSession(sessionId);
    
    res.status(201).json({
      success: true,
      sessionId,
      message: 'Chat session created successfully',
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    console.error('❌ Failed to create chat session:', error);
    res.status(500).json({
      error: 'Failed to create chat session',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

/**
 * @route GET /api/messages/stats
 * @desc Get message service statistics
 * @access Public
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const [dbStats, redisStats, chatbotStats] = await Promise.all([
      databaseService.testConnection(),
      redisService.getStats(),
      chatbotService.getStats()
    ]);
    
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: dbStats ? 'connected' : 'disconnected'
        },
        redis: redisStats,
        chatbot: chatbotStats
      }
    });
    return;
  } catch (error) {
    console.error('❌ Failed to get service stats:', error);
    res.status(500).json({
      error: 'Failed to retrieve service statistics',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

/**
 * @route DELETE /api/messages/sessions/:sessionId
 * @desc Delete a chat session and all its messages
 * @access Public
 */
router.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required',
        timestamp: new Date().toISOString()
      });
    }

    // Note: This would require implementing a delete method in DatabaseService
    // For now, we'll just return a success message
    res.status(200).json({
      success: true,
      sessionId,
      message: 'Session deletion not yet implemented',
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    console.error('❌ Failed to delete session:', error);
    res.status(500).json({
      error: 'Failed to delete session',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

/**
 * @route POST /api/messages/cleanup
 * @desc Clean up old messages and sessions
 * @access Public
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const { daysToKeep } = req.body;
    const keepDays = daysToKeep || 30;
    
    await databaseService.cleanupOldData(keepDays);
    
    res.status(200).json({
      success: true,
      message: `Cleaned up data older than ${keepDays} days`,
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    console.error('❌ Failed to cleanup old data:', error);
    res.status(500).json({
      error: 'Failed to cleanup old data',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

/**
 * @route GET /api/messages/models
 * @desc Get available LLM models
 * @access Public
 */
router.get('/models', async (req: Request, res: Response) => {
  try {
    const available = LLMFactory.getAvailableProviders();
    const modelMap: Record<string, string> = {
      openai: 'GPT-4o Mini',
      claude: 'Claude 3 Haiku',
      gemini: 'Gemini 1.5 Flash',
    };

    const models = available.map(p => ({
      id: p,
      name: modelMap[p] || p,
      provider: p,
    }));

    res.status(200).json({
      success: true,
      models,
      default: config.llm.defaultProvider,
      timestamp: new Date().toISOString(),
    });
    return;
  } catch (error) {
    console.error('❌ Failed to get available models:', error);
    res.status(500).json({
      error: 'Failed to retrieve available models',
      timestamp: new Date().toISOString(),
    });
    return;
  }
});

export default router;
