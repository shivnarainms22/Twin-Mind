'use client';

import ReactMarkdown from 'react-markdown';
import type { ChatMessage as ChatMessageType } from '@/types';

interface ChatMessageProps {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className="mb-3.5">
      <div className="text-[11px] text-muted uppercase tracking-wider mb-1">
        {isUser
          ? message.sourceSuggestionTitle
            ? `You · Suggestion`
            : 'You'
          : 'Assistant'
        }
      </div>
      <div
        className={`
          border rounded-lg px-3 py-2.5 text-[13px] leading-relaxed
          ${isUser
            ? 'bg-[rgba(110,168,254,0.08)] border-[rgba(110,168,254,0.3)]'
            : 'bg-panel-2 border-border'
          }
        `}
      >
        {isUser ? (
          message.content
        ) : (
          <div className="prose-chat">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
        {message.isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse" />
        )}
      </div>
    </div>
  );
}
