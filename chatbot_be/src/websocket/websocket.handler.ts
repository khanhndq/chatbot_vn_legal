import { Server, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { DatabaseService, Message } from "../services/database.service";
import {
  ChatbotService,
  ChatMessage,
  StreamCallbacks,
} from "../services/chatbot.service";

export interface WebSocketMessage {
  type: "chat" | "system" | "error";
  content: string;
  timestamp: Date;
  sessionId?: string;
}

export interface ChatEvent {
  sessionId: string;
  userMessage: string;
  timestamp: Date;
  stream?: boolean; // Enable streaming response
}

export class WebSocketHandler {
  private io: Server;
  private databaseService: DatabaseService;
  private chatbotService: ChatbotService;
  private activeConnections: Map<string, string> = new Map(); // connectionId -> sessionId

  constructor(
    io: Server,
    databaseService: DatabaseService,
    chatbotService: ChatbotService,
  ) {
    this.io = io;
    this.databaseService = databaseService;
    this.chatbotService = chatbotService;

    this.setupEventHandlers();
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    this.io.on("connection", (socket: Socket) => {
      console.log(`🔌 New WebSocket connection: ${socket.id}`);

      this.handleConnection(socket);
    });

    this.io.on("disconnect", (socket: Socket) => {
      console.log(`🔌 WebSocket disconnected: ${socket.id}`);
      this.handleDisconnection(socket);
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(socket: Socket): void {
    // Generate session ID for new connection
    const sessionId = uuidv4();

    // Store connection mapping
    this.activeConnections.set(socket.id, sessionId);

    // Create chat session in database
    this.databaseService.createChatSession(sessionId).catch((error) => {
      console.error("❌ Failed to create chat session:", error);
    });

    // Send welcome message
    const welcomeMessage: WebSocketMessage = {
      type: "system",
      content:
        "Welcome to VietLegal Assistant! I'm here to help you. How can I assist you today?",
      timestamp: new Date(),
      sessionId,
    };

    socket.emit("message", welcomeMessage);
    socket.emit("session_created", { sessionId });

    // Setup socket event handlers
    this.setupSocketEventHandlers(socket, sessionId);
  }

  /**
   * Setup individual socket event handlers
   */
  private setupSocketEventHandlers(socket: Socket, sessionId: string): void {
    // Handle chat messages
    socket.on("chat_message", async (data: ChatEvent) => {
      try {
        console.log(
          `💬 Chat message received from session ${sessionId}: ${data.userMessage}`,
        );

        // Check if streaming is requested
        if (data.stream) {
          await this.handleStreamingMessage(
            socket,
            sessionId,
            data.userMessage,
          );
        } else {
          await this.handleNonStreamingMessage(
            socket,
            sessionId,
            data.userMessage,
          );
        }
      } catch (error) {
        console.error("❌ Failed to process chat message:", error);

        const errorMessage: WebSocketMessage = {
          type: "error",
          content:
            "Sorry, I encountered an error processing your message. Please try again.",
          timestamp: new Date(),
          sessionId,
        };

        socket.emit("error", errorMessage);
      }
    });

    // Handle session join
    socket.on("join_session", async (data: { sessionId: string }) => {
      try {
        const { sessionId } = data;

        // Update connection mapping
        this.activeConnections.set(socket.id, sessionId);

        // Join socket room for the session
        socket.join(sessionId);

        // Create or update session in database
        await this.databaseService.createChatSession(sessionId);

        // Send confirmation
        socket.emit("session_joined", { sessionId });

        // Load chat history
        const chatHistory =
          await this.databaseService.getChatHistory(sessionId);
        socket.emit("chat_history", chatHistory);

        console.log(`👥 Client joined session: ${sessionId}`);
      } catch (error) {
        console.error("❌ Failed to join session:", error);

        const errorMessage: WebSocketMessage = {
          type: "error",
          content: "Failed to join session. Please try again.",
          timestamp: new Date(),
        };

        socket.emit("error", errorMessage);
      }
    });

    // Handle typing indicators
    socket.on("typing_start", (data: { sessionId: string }) => {
      socket
        .to(data.sessionId)
        .emit("user_typing", { sessionId: data.sessionId });
    });

    socket.on("typing_stop", (data: { sessionId: string }) => {
      socket
        .to(data.sessionId)
        .emit("user_stopped_typing", { sessionId: data.sessionId });
    });

    // Handle session leave
    socket.on("leave_session", (data: { sessionId: string }) => {
      const { sessionId } = data;
      socket.leave(sessionId);
      console.log(`👋 Client left session: ${sessionId}`);
    });

    // Handle ping/pong for connection health
    socket.on("ping", () => {
      socket.emit("pong", { timestamp: Date.now() });
    });
  }

  /**
   * Handle non-streaming message (original behavior)
   */
  private async handleNonStreamingMessage(
    socket: Socket,
    sessionId: string,
    userMessage: string,
  ): Promise<void> {
    // Process message through chatbot
    const chatMessage = await this.chatbotService.processMessage(
      sessionId,
      userMessage,
    );

    // Store message in database
    const dbMessage: Omit<Message, "created_at"> = {
      id: chatMessage.id,
      session_id: sessionId,
      user_message: chatMessage.userMessage,
      bot_response: chatMessage.botResponse,
      timestamp: chatMessage.timestamp,
    };

    await this.databaseService.storeMessage(dbMessage);

    // Send bot response back to client
    const botMessage: WebSocketMessage = {
      type: "chat",
      content: chatMessage.botResponse,
      timestamp: chatMessage.timestamp,
      sessionId,
    };

    socket.emit("bot_response", botMessage);

    // Broadcast to other clients in the same session
    socket.to(sessionId).emit("user_message", {
      type: "chat",
      content: chatMessage.userMessage,
      timestamp: chatMessage.timestamp,
      sessionId,
    });

    console.log(`🤖 Bot response sent: ${chatMessage.botResponse}`);
  }

  /**
   * Handle streaming message with chunked responses
   */
  private async handleStreamingMessage(
    socket: Socket,
    sessionId: string,
    userMessage: string,
  ): Promise<void> {
    // Notify client that streaming is starting
    socket.emit("stream_start", {
      sessionId,
      timestamp: new Date(),
    });

    const callbacks: StreamCallbacks = {
      onChunk: (chunk: string) => {
        socket.emit("stream_chunk", {
          content: chunk,
          sessionId,
          timestamp: new Date(),
        });
      },
      onComplete: async (fullResponse: string) => {
        socket.emit("stream_end", {
          content: fullResponse,
          sessionId,
          timestamp: new Date(),
        });
        console.log(`🤖 Streaming response completed for session ${sessionId}`);
      },
      onError: (error: Error) => {
        socket.emit("stream_error", {
          error: error.message,
          sessionId,
          timestamp: new Date(),
        });
        console.error(`❌ Streaming error for session ${sessionId}:`, error);
      },
    };

    // Process message with streaming
    const chatMessage = await this.chatbotService.processMessageStream(
      sessionId,
      userMessage,
      callbacks,
    );

    // Store complete message in database
    const dbMessage: Omit<Message, "created_at"> = {
      id: chatMessage.id,
      session_id: sessionId,
      user_message: chatMessage.userMessage,
      bot_response: chatMessage.botResponse,
      timestamp: chatMessage.timestamp,
    };

    await this.databaseService.storeMessage(dbMessage);

    // Broadcast to other clients in the same session
    socket.to(sessionId).emit("user_message", {
      type: "chat",
      content: chatMessage.userMessage,
      timestamp: chatMessage.timestamp,
      sessionId,
    });
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnection(socket: Socket): void {
    const sessionId = this.activeConnections.get(socket.id);

    if (sessionId) {
      // Remove connection mapping
      this.activeConnections.delete(socket.id);

      // Leave all rooms - get rooms and leave them individually
      const rooms = Array.from(socket.rooms);
      rooms.forEach((room) => socket.leave(room));

      console.log(`🔌 Client disconnected from session: ${sessionId}`);
    }
  }

  /**
   * Send message to specific session
   */
  public sendToSession(sessionId: string, message: WebSocketMessage): void {
    this.io.to(sessionId).emit("message", message);
  }

  /**
   * Broadcast message to all connected clients
   */
  public broadcastMessage(message: WebSocketMessage): void {
    this.io.emit("broadcast", message);
  }

  /**
   * Get active connections count
   */
  public getActiveConnectionsCount(): number {
    return this.activeConnections.size;
  }

  /**
   * Get active sessions count
   */
  public getActiveSessionsCount(): number {
    const uniqueSessions = new Set(this.activeConnections.values());
    return uniqueSessions.size;
  }

  /**
   * Get connection statistics
   */
  public getConnectionStats(): Record<string, any> {
    return {
      totalConnections: this.activeConnections.size,
      activeSessions: this.getActiveSessionsCount(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Force disconnect a specific session
   */
  public forceDisconnectSession(sessionId: string): void {
    const connectionsToRemove: string[] = [];

    // Find all connections for this session
    this.activeConnections.forEach((session, connectionId) => {
      if (session === sessionId) {
        connectionsToRemove.push(connectionId);
      }
    });

    // Disconnect found connections
    connectionsToRemove.forEach((connectionId) => {
      const socket = this.io.sockets.sockets.get(connectionId);
      if (socket) {
        socket.disconnect(true);
        this.activeConnections.delete(connectionId);
      }
    });

    console.log(
      `🛑 Force disconnected ${connectionsToRemove.length} connections from session: ${sessionId}`,
    );
  }

  /**
   * Clean up inactive sessions
   */
  public async cleanupInactiveSessions(): Promise<void> {
    try {
      // This could be enhanced to check for truly inactive sessions
      // For now, we'll just log the current state
      console.log(`🧹 Active connections: ${this.getActiveConnectionsCount()}`);
      console.log(`🧹 Active sessions: ${this.getActiveSessionsCount()}`);
    } catch (error) {
      console.error("❌ Failed to cleanup inactive sessions:", error);
    }
  }
}
