'use client';

import { useState } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  return (
    <div className="flex gap-2 p-2.5 border-t border-border">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        placeholder="Ask anything…"
        disabled={disabled}
        className="flex-1 bg-panel-2 border border-border text-text px-2.5 py-2 rounded-md text-[13px] placeholder:text-muted focus:outline-none focus:border-accent"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className="bg-accent text-black border-none px-3.5 py-2 rounded-md cursor-pointer text-[13px] font-medium hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Send
      </button>
    </div>
  );
}
