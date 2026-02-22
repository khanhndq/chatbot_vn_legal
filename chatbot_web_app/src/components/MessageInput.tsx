import React, { useState, useRef, useEffect } from 'react';

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  isWelcomeScreen?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({ 
  onSendMessage, 
  disabled = false, 
  placeholder = "Type your message...",
  isWelcomeScreen = false
}) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="w-full relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-orange-400 rounded-3xl blur opacity-10 group-hover:opacity-25 transition duration-500"></div>
        <div className="relative bg-white dark:bg-slate-900 border-2 border-primary/40 focus-within:border-primary rounded-2xl shadow-xl transition-all overflow-hidden flex flex-col">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={isWelcomeScreen ? 3 : 1}
            className="w-full px-6 py-5 bg-transparent border-none focus:ring-0 text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 resize-none text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: isWelcomeScreen ? '80px' : '60px', maxHeight: '180px' }}
          />
          <div className="flex items-center justify-between px-6 pb-4">
            <div className="flex items-center space-x-2">
              <button 
                type="button"
                className="p-2 text-slate-400 hover:text-primary transition-colors"
                title="Attach file"
                disabled={disabled}
              >
                <span className="material-symbols-outlined">attach_file</span>
              </button>
              <button 
                type="button"
                className="p-2 text-slate-400 hover:text-primary transition-colors"
                title="Add image"
                disabled={disabled}
              >
                <span className="material-symbols-outlined">image</span>
              </button>
            </div>
            <div className="flex items-center space-x-3">
              <button 
                type="button"
                className="p-2 text-primary hover:bg-primary/10 rounded-full transition-colors"
                title="Voice input"
                disabled={disabled}
              >
                <span className="material-symbols-outlined text-2xl">mic</span>
              </button>
              <button
                type="submit"
                disabled={!message.trim() || disabled}
                className="bg-primary text-white p-3 rounded-xl hover:bg-orange-600 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
                title="Send message"
              >
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      {!isWelcomeScreen && (
        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 text-center">
          Press Enter to send, Shift+Enter for new line
        </div>
      )}
    </form>
  );
};

export default MessageInput;

