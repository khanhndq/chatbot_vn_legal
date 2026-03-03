import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, SourceLink } from '../types/chat';
import { formatDistanceToNow } from 'date-fns';

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
  const isSystemMessage =
    !hasUserMessage && !hasBotResponse && !message.isStreaming;

  const formatTimestamp = (timestamp: Date) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return 'Just now';
    }
  };

  const renderBotContent = () => {
    if (message.isStreaming && !hasBotResponse) {
      // Thinking state: bouncing dots
      return (
        <div className='flex items-center space-x-1 py-1'>
          <span
            className='w-2 h-2 bg-primary rounded-full animate-bounce'
            style={{ animationDelay: '0ms' }}
          />
          <span
            className='w-2 h-2 bg-primary rounded-full animate-bounce'
            style={{ animationDelay: '150ms' }}
          />
          <span
            className='w-2 h-2 bg-primary rounded-full animate-bounce'
            style={{ animationDelay: '300ms' }}
          />
        </div>
      );
    }

    if (message.isStreaming && hasBotResponse) {
      // Receiving chunks: partial Markdown + blinking cursor
      return (
        <>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.bot_response}
          </ReactMarkdown>
          <span className='inline-block w-2 h-4 bg-primary/70 animate-pulse ml-0.5 align-text-bottom' />
        </>
      );
    }

    // Complete: full Markdown
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {message.bot_response}
      </ReactMarkdown>
    );
  };

  const formatDisplayUrl = (url: string): string => {
    try {
      const stripped = url.replace(/^https?:\/\//, '');
      const breadcrumb = stripped.replace(/\//g, ' › ');
      return breadcrumb.length > 60
        ? breadcrumb.slice(0, 57) + '...'
        : breadcrumb;
    } catch {
      return url;
    }
  };

  const getDomain = (url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  const GlobeFallback = () => (
    <svg
      className='w-4 h-4 text-slate-400'
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={1.5}
        d='M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 014 9 15 15 0 01-4 9 15 15 0 01-4-9 15 15 0 014-9z'
      />
    </svg>
  );

  const SourceCard: React.FC<{ link: SourceLink }> = ({ link }) => {
    const [faviconError, setFaviconError] = React.useState(false);
    const domain = getDomain(link.url);

    return (
      <a
        href={link.url}
        target='_blank'
        rel='noopener noreferrer'
        className='block rounded-lg p-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group'
      >
        <div className='flex items-center gap-2 mb-0.5'>
          {faviconError ? (
            <GlobeFallback />
          ) : (
            <img
              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
              alt=''
              width={16}
              height={16}
              className='flex-shrink-0'
              onError={() => setFaviconError(true)}
            />
          )}
          <span className='text-xs text-slate-700 dark:text-slate-300 font-medium truncate'>
            {domain}
          </span>
        </div>
        <p className='text-[11px] text-slate-400 dark:text-slate-500 truncate ml-6 mb-0.5'>
          {formatDisplayUrl(link.url)}
        </p>
        <p className='text-sm text-primary group-hover:underline ml-6 leading-snug'>
          {link.title}
        </p>
      </a>
    );
  };

  const renderSourceLinks = () => {
    if (
      !message.sourceLinks ||
      message.sourceLinks.length === 0 ||
      message.isStreaming
    ) {
      return null;
    }

    return (
      <div className='mt-3 pt-3 border-t border-slate-200 dark:border-slate-600'>
        <p className='text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5'>
          Nguồn tham khảo:
        </p>
        <div className='space-y-1'>
          {message.sourceLinks.map((link, idx) => (
            <SourceCard key={idx} link={link} />
          ))}
        </div>
      </div>
    );
  };

  if (isSystemMessage) {
    return (
      <div className='flex justify-center my-4'>
        <div className='bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-4 py-2 rounded-full text-sm'>
          {message.bot_response}
        </div>
      </div>
    );
  }

  // If message has both user message and bot response (or is streaming), render them separately
  if (hasUserMessage && (hasBotResponse || message.isStreaming)) {
    return (
      <>
        {/* User message on the right */}
        <div className='flex justify-end mb-4'>
          <div className='max-w-xs lg:max-w-2xl px-5 py-3 rounded-2xl bg-primary text-white shadow-md'>
            <div className='mb-1'>
              <p className='text-xs font-semibold mb-1 opacity-90'>You</p>
              <p className='text-sm leading-relaxed'>{message.user_message}</p>
            </div>
            <div className='text-xs opacity-70 mt-2'>
              {formatTimestamp(message.timestamp)}
            </div>
          </div>
        </div>

        {/* Bot response on the left */}
        <div className='flex justify-start mb-4'>
          <div className='flex items-start space-x-3 max-w-xs lg:max-w-2xl'>
            <div className='flex-shrink-0 w-8 h-8 rounded-full overflow-hidden shadow-md ring-2 ring-white dark:ring-slate-700'>
              <img
                src='/avatar.png'
                alt='VietLegal Assistant'
                className='w-full h-full object-cover'
              />
            </div>
            <div className='px-5 py-3 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-md border border-slate-200 dark:border-slate-700'>
              <div className='mb-1'>
                <p className='text-xs font-semibold mb-1 text-primary'>
                  VietLegal Assistant
                </p>
                <div className='text-sm leading-relaxed prose-bot'>
                  {renderBotContent()}
                </div>
              </div>
              {renderSourceLinks()}
              {!message.isStreaming && (
                <div className='text-xs opacity-70 mt-2 text-slate-500 dark:text-slate-400'>
                  {formatTimestamp(message.timestamp)}
                </div>
              )}
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
      className={`flex ${isUserMessage ? 'justify-end' : 'justify-start'} mb-4`}
    >
      {isUserMessage ? (
        <div className='max-w-xs lg:max-w-2xl px-5 py-3 rounded-2xl bg-primary text-white shadow-md'>
          <div className='mb-1'>
            <p className='text-xs font-semibold mb-1 opacity-90'>You</p>
            <p className='text-sm leading-relaxed'>{message.user_message}</p>
          </div>
          <div className='text-xs opacity-70 mt-2'>
            {formatTimestamp(message.timestamp)}
          </div>
        </div>
      ) : (
        <div className='flex items-start space-x-3 max-w-xs lg:max-w-2xl'>
          <div className='flex-shrink-0 w-8 h-8 rounded-full overflow-hidden shadow-md ring-2 ring-white dark:ring-slate-700'>
            <img
              src='/avatar.png'
              alt='VietLegal Assistant'
              className='w-full h-full object-cover'
            />
          </div>
          <div className='px-5 py-3 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-md border border-slate-200 dark:border-slate-700'>
            <div className='mb-1'>
              <p className='text-xs font-semibold mb-1 text-primary'>
                VietLegal Assistant
              </p>
              <div className='text-sm leading-relaxed prose-bot'>
                {renderBotContent()}
              </div>
            </div>
            {renderSourceLinks()}
            {!message.isStreaming && (
              <div className='text-xs opacity-70 mt-2 text-slate-500 dark:text-slate-400'>
                {formatTimestamp(message.timestamp)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Message;
