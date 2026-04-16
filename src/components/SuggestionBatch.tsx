'use client';

import type { Suggestion, SuggestionBatch as SuggestionBatchType } from '@/types';
import SuggestionCard from './SuggestionCard';

interface SuggestionBatchProps {
  batch: SuggestionBatchType;
  isFresh: boolean;
  onSuggestionClick: (suggestion: Suggestion) => void;
}

export default function SuggestionBatch({ batch, isFresh, onSuggestionClick }: SuggestionBatchProps) {
  const time = new Date(batch.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className={isFresh ? 'animate-fadein' : ''}>
      {batch.suggestions.map((suggestion) => (
        <SuggestionCard
          key={suggestion.id}
          suggestion={suggestion}
          isFresh={isFresh}
          onClick={onSuggestionClick}
        />
      ))}
      <div className="text-[10px] text-muted text-center py-1.5 uppercase tracking-wider">
        — Batch · {time} —
      </div>
    </div>
  );
}
