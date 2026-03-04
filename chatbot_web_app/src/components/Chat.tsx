import React, { useEffect, useRef } from "react";
import { useChat } from "../hooks/useChat";
import Message from "./Message";
import MessageInput from "./MessageInput";

interface ChatProps {
  sessionId?: string;
  className?: string;
  onToggleDarkMode: () => void;
  isDarkMode: boolean;
}

const Chat: React.FC<ChatProps> = ({
  sessionId,
  className = "",
  onToggleDarkMode,
  isDarkMode,
}) => {
  const {
    messages,
    isConnected,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    connectionStatus,
    selectedModel,
    setSelectedModel,
    availableModels,
  } = useChat(sessionId);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: isStreaming ? ("instant" as ScrollBehavior) : "smooth",
    });
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const suggestions = [
    "Hợp đồng lao động được quy định như thế nào?",
    "Người lao động có quyền đơn phương chấm dứt hợp đồng không?",
    "Thời gian thử việc tối đa là bao lâu?",
  ];

  return (
    <div
      className={`flex flex-col min-h-screen text-slate-900 dark:text-slate-100 ${className}`}
    >
      {/* Main Content */}
      {messages.length === 0 ? (
        // Welcome Screen
        <main className="flex-grow flex flex-col items-center justify-center px-4 relative overflow-hidden">
          <div className="absolute inset-0 gradient-bg -z-10"></div>
          <div className="w-full max-w-3xl flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-full overflow-hidden shadow-lg shadow-primary/20 ring-4 ring-white dark:ring-slate-800">
                <img
                  src="/avatar.png"
                  alt="VietLegal Assistant"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <h1 className="text-4xl font-bold mb-3 text-slate-800 dark:text-white">
              VietLegal Assistant
            </h1>
            <p className="text-center text-slate-600 dark:text-slate-400 mb-12 max-w-md leading-relaxed">
              Xin chào, tôi có thể hỗ trợ bạn về:{" "}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Luật Lao động
              </span>
              ,{" "}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Bảo hiểm xã hội & Bảo hiểm y tế
              </span>{" "}
              và{" "}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Thuế, Luật Doanh nghiệp & Luật Dân sự
              </span>
              .
            </p>

            {/* Suggestion Buttons */}
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium hover:border-primary hover:text-primary dark:hover:border-primary dark:hover:text-primary transition-all shadow-sm"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {/* Message Input for Welcome Screen */}
            <div className="w-full">
              <MessageInput
                onSendMessage={sendMessage}
                disabled={!isConnected || connectionStatus === "error" || isStreaming}
                placeholder={
                  isStreaming
                    ? "Đang trả lời..."
                    : "Hỏi tôi bất cứ điều gì về luật lao động, bảo hiểm, thuế, doanh nghiệp hoặc pháp luật dân sự..."
                }
                isWelcomeScreen={true}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                availableModels={availableModels}
              />
            </div>
          </div>
        </main>
      ) : (
        // Chat Messages View
        <main className="flex-grow flex flex-col px-4 py-6 relative overflow-hidden">
          <div className="w-full max-w-4xl mx-auto flex-grow flex flex-col">
            {/* Messages Container */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto space-y-4 mb-4"
            >
              {messages.map((message, index) => (
                <Message
                  key={message.id}
                  message={message}
                  isLastMessage={index === messages.length - 1}
                />
              ))}

              {/* Error message */}
              {error && (
                <div className="flex justify-center">
                  <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg max-w-md">
                    <div className="flex items-center">
                      <span className="mr-2">⚠️</span>
                      <span className="text-sm">{error}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Auto-scroll anchor */}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input for Chat View */}
            <MessageInput
              onSendMessage={sendMessage}
              disabled={!isConnected || connectionStatus === "error" || isStreaming}
              placeholder={
                isStreaming
                  ? "Đang trả lời..."
                  : !isConnected
                    ? "Đang kết nối..."
                    : "Nhập tin nhắn..."
              }
              isWelcomeScreen={false}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              availableModels={availableModels}
            />
          </div>
        </main>
      )}

      {/* Theme Toggle Button */}
      <div className="fixed bottom-6 right-6">
        <button
          onClick={onToggleDarkMode}
          className="p-3 bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform"
        >
          <span className="material-symbols-outlined">
            {isDarkMode ? "light_mode" : "dark_mode"}
          </span>
        </button>
      </div>
    </div>
  );
};

export default Chat;
