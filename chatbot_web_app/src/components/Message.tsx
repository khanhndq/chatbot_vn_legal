import React from "react";
import { ChatMessage } from "../types/chat";
import { formatDistanceToNow } from "date-fns";

interface MessageProps {
  message: ChatMessage;
  isLastMessage?: boolean;
}

const Message: React.FC<MessageProps> = ({
  message,
  isLastMessage = false,
}) => {
  const hasUserMessage = !!message.user_message;
  const hasBotResponse = !!message.bot_response;
  const isSystemMessage = !hasUserMessage && !hasBotResponse;

  const formatTimestamp = (timestamp: Date) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return "Just now";
    }
  };

  if (isSystemMessage) {
    return (
      <div className="flex justify-center my-4">
        <div className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-4 py-2 rounded-full text-sm">
          {message.bot_response}
        </div>
      </div>
    );
  }

  // If message has both user message and bot response, render them separately
  if (hasUserMessage && hasBotResponse) {
    return (
      <>
        {/* User message on the right */}
        <div className="flex justify-end mb-4">
          <div className="max-w-xs lg:max-w-2xl px-5 py-3 rounded-2xl bg-primary text-white shadow-md">
            <div className="mb-1">
              <p className="text-xs font-semibold mb-1 opacity-90">You</p>
              <p className="text-sm leading-relaxed">{message.user_message}</p>
            </div>
            <div className="text-xs opacity-70 mt-2">
              {formatTimestamp(message.timestamp)}
            </div>
          </div>
        </div>

        {/* Bot response on the left */}
        <div className="flex justify-start mb-4">
          <div className="flex items-start space-x-3 max-w-xs lg:max-w-2xl">
            <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden shadow-md ring-2 ring-white dark:ring-slate-700">
              <img
                src="/avatar.png"
                alt="VietLegal Assistant"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="px-5 py-3 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-md border border-slate-200 dark:border-slate-700">
              <div className="mb-1">
                <p className="text-xs font-semibold mb-1 text-primary">
                  VietLegal Assistant
                </p>
                <p className="text-sm leading-relaxed">
                  {message.bot_response}
                </p>
              </div>
              <div className="text-xs opacity-70 mt-2 text-slate-500 dark:text-slate-400">
                {formatTimestamp(message.timestamp)}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Single message (either user or bot)
  const isUserMessage = hasUserMessage;

  return (
    <div
      className={`flex ${isUserMessage ? "justify-end" : "justify-start"} mb-4`}
    >
      {isUserMessage ? (
        <div className="max-w-xs lg:max-w-2xl px-5 py-3 rounded-2xl bg-primary text-white shadow-md">
          <div className="mb-1">
            <p className="text-xs font-semibold mb-1 opacity-90">You</p>
            <p className="text-sm leading-relaxed">{message.user_message}</p>
          </div>
          <div className="text-xs opacity-70 mt-2">
            {formatTimestamp(message.timestamp)}
          </div>
        </div>
      ) : (
        <div className="flex items-start space-x-3 max-w-xs lg:max-w-2xl">
          <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden shadow-md ring-2 ring-white dark:ring-slate-700">
            <img
              src="/avatar.png"
              alt="VietLegal Assistant"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="px-5 py-3 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-md border border-slate-200 dark:border-slate-700">
            <div className="mb-1">
              <p className="text-xs font-semibold mb-1 text-primary">
                VietLegal Assistant
              </p>
              <p className="text-sm leading-relaxed">{message.bot_response}</p>
            </div>
            <div className="text-xs opacity-70 mt-2 text-slate-500 dark:text-slate-400">
              {formatTimestamp(message.timestamp)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Message;
