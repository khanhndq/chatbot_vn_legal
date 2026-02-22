export interface WebSocketMessage {
  type: 'chat' | 'system' | 'error';
  content: string;
  timestamp: Date;
  sessionId?: string;
}

export interface ChatEvent {
  sessionId: string;
  userMessage: string;
  timestamp: Date;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  user_message: string;
  bot_response: string;
  timestamp: Date;
  created_at?: Date;
}

export interface ChatSession {
  id: string;
  created_at: Date;
  last_activity?: Date;
  message_count?: number;
}

export interface ChatHistoryResponse {
  success: boolean;
  sessionId: string;
  messageCount: number;
  messages: ChatMessage[];
  timestamp: string;
}

export interface SendMessageResponse {
  success: boolean;
  messageId: string;
  sessionId: string;
  userMessage: string;
  botResponse: string;
  timestamp: Date;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  services: {
    database: string;
    redis: string;
  };
}

export interface TypingIndicator {
  sessionId: string;
  isTyping: boolean;
}

