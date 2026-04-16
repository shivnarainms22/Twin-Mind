export interface TranscriptChunk {
  id: string;
  text: string;
  timestamp: number;
}

export type SuggestionType = 'question' | 'talking-point' | 'answer' | 'fact-check' | 'clarification';

export interface Suggestion {
  id: string;
  type: SuggestionType;
  title: string;
  preview: string;
  batchId: string;
}

export interface SuggestionBatch {
  id: string;
  timestamp: number;
  suggestions: Suggestion[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sourceSuggestionTitle?: string;
  isStreaming?: boolean;
}

export interface SessionExport {
  exportedAt: string;
  transcript: { text: string; timestamp: string }[];
  suggestionBatches: {
    timestamp: string;
    suggestions: { type: string; title: string; preview: string }[];
  }[];
  chat: {
    role: string;
    content: string;
    timestamp: string;
    sourceSuggestion?: string;
  }[];
}

export interface ApiError {
  error: string;
  code: string;
  details?: string;
  retryAfter?: number;
}
