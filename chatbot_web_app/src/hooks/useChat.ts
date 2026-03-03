import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WebSocketMessage, ChatMessage, SourceLink } from '../types/chat';
import websocketService from '../services/websocket.service';
import apiService from '../services/api.service';

interface UseChatReturn {
  messages: ChatMessage[];
  isConnected: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  sendMessage: (message: string) => void;
  clearMessages: () => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
}

export const useChat = (sessionId?: string): UseChatReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  
  const queryClient = useQueryClient();
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Query for chat history
  const { data: chatHistory, isLoading } = useQuery({
    queryKey: ['chatHistory', sessionId],
    queryFn: () => sessionId ? apiService.getChatHistory(sessionId) : null,
    enabled: !!sessionId && isConnected,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutation for sending messages via REST API (fallback)
  const sendMessageMutation = useMutation({
    mutationFn: ({ sessionId, message }: { sessionId: string; message: string }) =>
      apiService.sendMessage(sessionId, message),
    onSuccess: (data) => {
      // Add the new message to the local state
      const newMessage: ChatMessage = {
        id: data.messageId,
        session_id: data.sessionId,
        user_message: data.userMessage,
        bot_response: data.botResponse,
        timestamp: data.timestamp,
      };
      
      setMessages(prev => [...prev, newMessage]);
      
      // Invalidate and refetch chat history
      queryClient.invalidateQueries({ queryKey: ['chatHistory', sessionId] });
    },
    onError: (error: any) => {
      setError(`Failed to send message: ${error.message}`);
    }
  });

  // Event handlers
  const handleIncomingMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'system') {
      // Handle system messages (welcome, etc.)
      const systemMessage: ChatMessage = {
        id: `system-${Date.now()}`,
        session_id: message.sessionId || sessionId || '',
        user_message: '',
        bot_response: message.content,
        timestamp: message.timestamp,
      };
      
      setMessages(prev => [...prev, systemMessage]);
    }
  }, [sessionId]);

  const handleBotResponse = useCallback((message: WebSocketMessage & { sourceLinks?: SourceLink[] }) => {
    // Find the last user message and update it with bot response
    setMessages(prev => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && !lastMessage.bot_response) {
        // Update the last message with bot response
        return prev.map((msg, index) =>
          index === prev.length - 1
            ? { ...msg, bot_response: message.content, sourceLinks: message.sourceLinks }
            : msg
        );
      }
      return prev;
    });
  }, []);

  const handleWebSocketError = useCallback((message: WebSocketMessage) => {
    setError(message.content);
  }, []);

  const handleSessionCreated = useCallback((data: { sessionId: string }) => {
    console.log('Session created:', data.sessionId);
    setError(null);
  }, []);

  const handleSessionJoined = useCallback((data: { sessionId: string }) => {
    console.log('Session joined:', data.sessionId);
    setError(null);
  }, []);

  const handleChatHistory = useCallback((history: any[]) => {
    if (history && history.length > 0) {
      setMessages(history);
    }
  }, []);

  const handleTypingIndicator = useCallback((data: { sessionId: string; isTyping: boolean }) => {
    // Handle typing indicators if needed
    console.log('Typing indicator:', data);
  }, []);

  const handleConnectionChange = useCallback((connected: boolean) => {
    setIsConnected(connected);
    setConnectionStatus(connected ? 'connected' : 'disconnected');

    if (connected) {
      setError(null);
    }
  }, []);

  // Streaming event handlers
  const handleStreamStart = useCallback(() => {
    setIsStreaming(true);
    setMessages(prev => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.isStreaming) {
        return prev;
      }
      return prev.map((msg, i) =>
        i === prev.length - 1 ? { ...msg, isStreaming: true } : msg
      );
    });
  }, []);

  const handleStreamChunk = useCallback((data: { content: string }) => {
    setMessages(prev => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].isStreaming) { idx = i; break; }
      }
      if (idx === -1) return prev;
      return prev.map((msg, i) =>
        i === idx ? { ...msg, bot_response: msg.bot_response + data.content } : msg
      );
    });
  }, []);

  const handleStreamEnd = useCallback((data: { content: string; sourceLinks?: SourceLink[] }) => {
    setIsStreaming(false);
    setMessages(prev => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].isStreaming) { idx = i; break; }
      }
      if (idx === -1) return prev;
      return prev.map((msg, i) =>
        i === idx ? { ...msg, bot_response: data.content, isStreaming: false, sourceLinks: data.sourceLinks } : msg
      );
    });
  }, []);

  const handleStreamError = useCallback((data: { error: string }) => {
    setIsStreaming(false);
    setMessages(prev => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].isStreaming) { idx = i; break; }
      }
      if (idx === -1) return prev;
      return prev.map((msg, i) =>
        i === idx ? { ...msg, bot_response: `Lỗi: ${data.error}`, isStreaming: false } : msg
      );
    });
  }, []);

  // Initialize WebSocket connection
  const initializeWebSocket = useCallback(async () => {
    try {
      setConnectionStatus('connecting');
      setError(null);
      
      // Setup WebSocket event handlers
      websocketService.onMessage(handleIncomingMessage);
      websocketService.onBotResponse(handleBotResponse);
      websocketService.onError(handleWebSocketError);
      websocketService.onSessionCreated(handleSessionCreated);
      websocketService.onSessionJoined(handleSessionJoined);
      websocketService.onChatHistory(handleChatHistory);
      websocketService.onTyping(handleTypingIndicator);
      websocketService.onConnectionChange(handleConnectionChange);
      websocketService.onStreamStart(handleStreamStart);
      websocketService.onStreamChunk(handleStreamChunk);
      websocketService.onStreamEnd(handleStreamEnd);
      websocketService.onStreamError(handleStreamError);

      // Connect to WebSocket
      await websocketService.connect(sessionId);

    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      setConnectionStatus('error');
      setError('Failed to connect to chat server');
    }
  }, [
    sessionId,
    handleIncomingMessage,
    handleBotResponse,
    handleWebSocketError,
    handleSessionCreated,
    handleSessionJoined,
    handleChatHistory,
    handleTypingIndicator,
    handleConnectionChange,
    handleStreamStart,
    handleStreamChunk,
    handleStreamEnd,
    handleStreamError,
  ]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (sessionId) {
      initializeWebSocket();
    }
    
    return () => {
      websocketService.disconnect();
    };
  }, [sessionId, initializeWebSocket]);

  // Update messages when chat history is loaded
  useEffect(() => {
    if (chatHistory?.messages) {
      setMessages(chatHistory.messages);
    }
  }, [chatHistory]);

  const sendMessage = useCallback((message: string) => {
    if (!message.trim() || isStreaming) return;

    // Add user message to local state immediately
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      session_id: sessionId || '',
      user_message: message.trim(),
      bot_response: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage]);

    // Try to send via WebSocket first
    if (isConnected && websocketService.getConnectionStatus()) {
      websocketService.sendMessage(message.trim());
    } else {
      // Fallback to REST API (non-streaming)
      userMessage.isStreaming = false;
      if (sessionId) {
        sendMessageMutation.mutate({ sessionId, message: message.trim() });
      } else {
        setError('No active session');
      }
    }

    // Clear any existing error
    setError(null);
  }, [isConnected, isStreaming, sessionId, sendMessageMutation]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return {
    messages,
    isConnected,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    clearMessages,
    connectionStatus,
  };
};
