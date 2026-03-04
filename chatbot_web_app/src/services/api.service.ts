import axios, { AxiosInstance } from 'axios';
import {
  ChatHistoryResponse,
  SendMessageResponse,
  HealthResponse,
  ChatSession,
  LLMModelType,
  LLMModelInfo,
} from '../types/chat';

class ApiService {
  private api: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for logging
    this.api.interceptors.request.use(
      (config) => {
        console.log(`🌐 API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging
    this.api.interceptors.response.use(
      (response) => {
        console.log(`✅ API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('❌ API Response Error:', error.response?.status, error.response?.data);
        return Promise.reject(error);
      }
    );
  }

  // Health check
  async checkHealth(): Promise<HealthResponse> {
    const response = await this.api.get('/health');
    return response.data;
  }

  // Get chat history
  async getChatHistory(sessionId: string, limit: number = 50): Promise<ChatHistoryResponse> {
    const response = await this.api.get(`/api/messages/history/${sessionId}?limit=${limit}`);
    return response.data;
  }

  // Send message via REST API (alternative to WebSocket)
  async sendMessage(sessionId: string, message: string, model?: LLMModelType): Promise<SendMessageResponse> {
    const response = await this.api.post('/api/messages/send', {
      sessionId,
      message,
      model,
    });
    return response.data;
  }

  // Get available LLM models
  async getAvailableModels(): Promise<{ models: LLMModelInfo[]; default: string }> {
    const response = await this.api.get('/api/messages/models');
    return response.data;
  }

  // Get active sessions
  async getActiveSessions(): Promise<{ success: boolean; sessions: ChatSession[] }> {
    const response = await this.api.get('/api/messages/sessions');
    return response.data;
  }

  // Create new session
  async createSession(sessionId: string): Promise<{ success: boolean; sessionId: string }> {
    const response = await this.api.post('/api/messages/sessions', { sessionId });
    return response.data;
  }

  // Get service statistics
  async getStats(): Promise<any> {
    const response = await this.api.get('/api/messages/stats');
    return response.data;
  }

  // Cleanup old data
  async cleanupOldData(daysToKeep: number = 30): Promise<{ success: boolean; message: string }> {
    const response = await this.api.post('/api/messages/cleanup', { daysToKeep });
    return response.data;
  }
}

export default new ApiService();

