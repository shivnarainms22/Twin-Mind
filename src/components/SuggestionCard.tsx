'use client';

import type { Suggestion } from '@/types';
import { SUGGESTION_TYPE_CONFIG } from '@/lib/constants';

interface SuggestionCardProps {
  suggestion: Suggestion;
  isFresh: boolean;
  onClick: (suggestion: Suggestion) => void;
}

export default function SuggestionCard({ suggestion, isFresh, onClick }: SuggestionCardProps) {
  const typeConfig = SUGGESTION_TYPE_CONFIG[suggestion.type];

  return (
    <div
      onClick={() => onClick(suggestion)}
      className={`
        border rounded-lg p-3 mb-2.5 cursor-pointer
        transition-all duration-150
        bg-panel-2 hover:translate-y-[-1px]
        ${isFresh
          ? 'border-accent hover:border-accent'
          : 'border-border opacity-55 hover:border-accent hover:opacity-80'
        }
      `}
    >
      <span
        className={`
          inline-block text-[10px] uppercase tracking-wider
          px-1.5 py-0.5 rounded mb-1.5
          ${typeConfig.badgeClass}
        `}
      >
        {typeConfig.label}
      </span>
      <div className="text-sm font-medium leading-snug">{suggestion.title}</div>
      <div className="text-xs text-muted mt-1 leading-relaxed">{suggestion.preview}</div>
    </div>
  );
}
