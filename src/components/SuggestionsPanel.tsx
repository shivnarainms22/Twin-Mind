'use client';

import type { Suggestion, SuggestionBatch as SuggestionBatchType } from '@/types';
import SuggestionBatch from './SuggestionBatch';

interface SuggestionsPanelProps {
  suggestionBatches: SuggestionBatchType[];
  onSuggestionClick: (suggestion: Suggestion) => void;
  onRefresh: () => void;
  secondsUntilRefresh: number;
  isLoading: boolean;
  isRecording: boolean;
}

export default function SuggestionsPanel({
  suggestionBatches,
  onSuggestionClick,
  onRefresh,
  secondsUntilRefresh,
  isLoading,
  isRecording,
}: SuggestionsPanelProps) {
  return (
    <div className="bg-panel border border-border rounded-[10px] flex flex-col overflow-hidden min-h-0">
      <header className="px-3.5 py-2.5 border-b border-border text-xs uppercase tracking-wider text-muted flex justify-between items-center">
        <span>Live Suggestions</span>
        <span>{suggestionBatches.length} batch{suggestionBatches.length !== 1 ? 'es' : ''}</span>
      </header>

      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border">
        <button
          onClick={onRefresh}
          disabled={isLoading || !isRecording}
          className="bg-panel-2 text-text border border-border px-3 py-1.5 rounded-md text-xs cursor-pointer hover:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? '⟳ Loading…' : '↻ Refresh'}
        </button>
        <span className="text-[11px] text-muted ml-auto">
          {isRecording
            ? isLoading
              ? 'generating…'
              : `auto-refresh in ${secondsUntilRefresh}s`
            : 'start recording to begin'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5">
        {suggestionBatches.length === 0 ? (
          <div className="text-muted text-[13px] text-center py-8 leading-relaxed">
            Suggestions appear here once recording starts.
          </div>
        ) : (
          suggestionBatches.map((batch, index) => (
            <SuggestionBatch
              key={batch.id}
              batch={batch}
              isFresh={index === 0}
              onSuggestionClick={onSuggestionClick}
            />
          ))
        )}
      </div>
    </div>
  );
}
