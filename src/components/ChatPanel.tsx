'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage as ChatMessageType } from '@/types';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';

interface ChatPanelProps {
  messages: ChatMessageType[];
  onSendMessage: (message: string) => void;
  isStreaming: boolean;
}

export default function ChatPanel({ messages, onSendMessage, isStreaming }: ChatPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="bg-panel border border-border rounded-[10px] flex flex-col overflow-hidden min-h-0">
      <header className="px-3.5 py-2.5 border-b border-border text-xs uppercase tracking-wider text-muted flex justify-between items-center">
        <span>Chat</span>
        <span>session-only</span>
      </header>

      <div ref={bodyRef} className="flex-1 overflow-y-auto p-3.5">
        {messages.length === 0 ? (
          <div className="text-muted text-[13px] text-center py-8 leading-relaxed">
            Click a suggestion or type a question below.
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))
        )}
      </div>

      <ChatInput onSend={onSendMessage} disabled={isStreaming} />
    </div>
  );
}
