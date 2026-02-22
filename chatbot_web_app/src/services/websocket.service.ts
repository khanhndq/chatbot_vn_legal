import { io, Socket } from 'socket.io-client';
import { WebSocketMessage, ChatEvent, TypingIndicator } from '../types/chat';

class WebSocketService {
  private socket: Socket | null = null;
  private sessionId: string | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;

  // Event callbacks
  private onMessageCallback: ((message: WebSocketMessage) => void) | null = null;
  private onBotResponseCallback: ((message: WebSocketMessage) => void) | null = null;
  private onErrorCallback: ((message: WebSocketMessage) => void) | null = null;
  private onSessionCreatedCallback: ((data: { sessionId: string }) => void) | null = null;
  private onSessionJoinedCallback: ((data: { sessionId: string }) => void) | null = null;
  private onChatHistoryCallback: ((history: any[]) => void) | null = null;
  private onTypingCallback: ((data: TypingIndicator) => void) | null = null;
  private onConnectionChangeCallback: ((connected: boolean) => void) | null = null;

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for window focus/blur to handle reconnection
    window.addEventListener('focus', () => {
      if (!this.isConnected && this.sessionId) {
        this.connect();
      }
    });

    window.addEventListener('beforeunload', () => {
      this.disconnect();
    });
  }

  connect(sessionId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const serverUrl = process.env.REACT_APP_WEBSOCKET_URL || 'http://localhost:3000';
        
        console.log(`🔌 Connecting to WebSocket server: ${serverUrl}`);
        
        this.socket = io(serverUrl, {
          transports: ['websocket', 'polling'],
          timeout: 10000,
          reconnection: true,
          reconnectionAttempts: this.maxReconnectAttempts,
          reconnectionDelay: this.reconnectDelay,
        });

        this.socket.on('connect', () => {
          console.log('✅ WebSocket connected successfully');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          if (this.onConnectionChangeCallback) {
            this.onConnectionChangeCallback(true);
          }

          // If sessionId is provided, join the session
          if (sessionId) {
            this.joinSession(sessionId);
          }

          resolve();
        });

        this.socket.on('disconnect', (reason: string) => {
          console.log('🔌 WebSocket disconnected:', reason);
          this.isConnected = false;
          
          if (this.onConnectionChangeCallback) {
            this.onConnectionChangeCallback(false);
          }

          // Attempt to reconnect if not manually disconnected
          if (reason !== 'io client disconnect') {
            this.handleReconnection();
          }
        });

        this.socket.on('connect_error', (error: Error) => {
          console.error('❌ WebSocket connection error:', error);
          this.isConnected = false;
          
          if (this.onConnectionChangeCallback) {
            this.onConnectionChangeCallback(false);
          }

          reject(error);
        });

        // Setup message handlers
        this.setupMessageHandlers();

      } catch (error) {
        console.error('❌ Failed to create WebSocket connection:', error);
        reject(error);
      }
    });
  }

  private setupMessageHandlers(): void {
    if (!this.socket) return;

    // Handle incoming messages
    this.socket.on('message', (message: WebSocketMessage) => {
      console.log('📨 Received message:', message);
      if (this.onMessageCallback) {
        this.onMessageCallback(message);
      }
    });

    // Handle bot responses
    this.socket.on('bot_response', (message: WebSocketMessage) => {
      console.log('🤖 Bot response received:', message);
      if (this.onBotResponseCallback) {
        this.onBotResponseCallback(message);
      }
    });

    // Handle errors
    this.socket.on('error', (message: WebSocketMessage) => {
      console.error('❌ WebSocket error:', message);
      if (this.onErrorCallback) {
        this.onErrorCallback(message);
      }
    });

    // Handle session events
    this.socket.on('session_created', (data: { sessionId: string }) => {
      console.log('🆕 Session created:', data.sessionId);
      this.sessionId = data.sessionId;
      if (this.onSessionCreatedCallback) {
        this.onSessionCreatedCallback(data);
      }
    });

    this.socket.on('session_joined', (data: { sessionId: string }) => {
      console.log('👥 Session joined:', data.sessionId);
      this.sessionId = data.sessionId;
      if (this.onSessionJoinedCallback) {
        this.onSessionJoinedCallback(data);
      }
    });

    // Handle chat history
    this.socket.on('chat_history', (history: any[]) => {
      console.log('📚 Chat history received:', history.length, 'messages');
      if (this.onChatHistoryCallback) {
        this.onChatHistoryCallback(history);
      }
    });

    // Handle typing indicators
    this.socket.on('user_typing', (data: TypingIndicator) => {
      console.log('⌨️ User typing:', data);
      if (this.onTypingCallback) {
        this.onTypingCallback({ ...data, isTyping: true });
      }
    });

    this.socket.on('user_stopped_typing', (data: TypingIndicator) => {
      console.log('⌨️ User stopped typing:', data);
      if (this.onTypingCallback) {
        this.onTypingCallback({ ...data, isTyping: false });
      }
    });

    // Handle ping/pong for connection health
    this.socket.on('pong', (data: { timestamp: number }) => {
      console.log('🏓 Pong received:', new Date(data.timestamp));
    });
  }

  private handleReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`🔄 Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (!this.isConnected) {
        this.connect(this.sessionId || undefined);
      }
    }, delay);
  }

  disconnect(): void {
    if (this.socket) {
      console.log('🔌 Disconnecting WebSocket');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.sessionId = null;
      
      if (this.onConnectionChangeCallback) {
        this.onConnectionChangeCallback(false);
      }
    }
  }

  joinSession(sessionId: string): void {
    if (this.socket && this.isConnected) {
      console.log(`👥 Joining session: ${sessionId}`);
      this.socket.emit('join_session', { sessionId });
      this.sessionId = sessionId;
    } else {
      console.error('❌ Cannot join session: WebSocket not connected');
    }
  }

  sendMessage(message: string): void {
    if (this.socket && this.isConnected && this.sessionId) {
      console.log(`💬 Sending message: ${message}`);
      const chatEvent: ChatEvent = {
        sessionId: this.sessionId,
        userMessage: message,
        timestamp: new Date()
      };
      this.socket.emit('chat_message', chatEvent);
    } else {
      console.error('❌ Cannot send message: WebSocket not connected or no session');
    }
  }

  startTyping(): void {
    if (this.socket && this.isConnected && this.sessionId) {
      this.socket.emit('typing_start', { sessionId: this.sessionId });
    }
  }

  stopTyping(): void {
    if (this.socket && this.isConnected && this.sessionId) {
      this.socket.emit('typing_stop', { sessionId: this.sessionId });
    }
  }

  ping(): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('ping');
    }
  }

  // Event callback setters
  onMessage(callback: (message: WebSocketMessage) => void): void {
    this.onMessageCallback = callback;
  }

  onBotResponse(callback: (message: WebSocketMessage) => void): void {
    this.onBotResponseCallback = callback;
  }

  onError(callback: (message: WebSocketMessage) => void): void {
    this.onErrorCallback = callback;
  }

  onSessionCreated(callback: (data: { sessionId: string }) => void): void {
    this.onSessionCreatedCallback = callback;
  }

  onSessionJoined(callback: (data: { sessionId: string }) => void): void {
    this.onSessionJoinedCallback = callback;
  }

  onChatHistory(callback: (history: any[]) => void): void {
    this.onChatHistoryCallback = callback;
  }

  onTyping(callback: (data: TypingIndicator) => void): void {
    this.onTypingCallback = callback;
  }

  onConnectionChange(callback: (connected: boolean) => void): void {
    this.onConnectionChangeCallback = callback;
  }

  // Getters
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }
}

export default new WebSocketService();

