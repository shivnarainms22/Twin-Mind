'use client';

import { create } from 'zustand';
import type { TranscriptChunk, SuggestionBatch, Suggestion, ChatMessage } from '@/types';
import { TIMING } from '@/lib/constants';

interface SessionState {
  // Recording
  isRecording: boolean;

  // Transcript
  transcriptChunks: TranscriptChunk[];

  // Suggestions
  suggestionBatches: SuggestionBatch[];
  isLoadingSuggestions: boolean;

  // Chat
  chatMessages: ChatMessage[];
  isStreamingChat: boolean;

  // Timer
  secondsUntilRefresh: number;

  // Errors
  error: { type: string; message: string } | null;

  // Debug metrics
  lastTranscribeLatency: number | null;
  lastSuggestionsLatency: number | null;
  lastBlobSize: number | null;
}

interface SessionActions {
  setRecording: (v: boolean) => void;
  addTranscriptChunk: (text: string) => void;
  addSuggestionBatch: (suggestions: Omit<Suggestion, 'id' | 'batchId'>[]) => void;
  setLoadingSuggestions: (v: boolean) => void;
  addChatMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  appendToStreamingMessage: (messageId: string, delta: string) => void;
  finalizeStreamingMessage: (messageId: string) => void;
  setStreamingChat: (v: boolean) => void;
  setSecondsUntilRefresh: (n: number) => void;
  setError: (e: { type: string; message: string } | null) => void;
  setDebugMetrics: (metrics: Partial<Pick<SessionState, 'lastTranscribeLatency' | 'lastSuggestionsLatency' | 'lastBlobSize'>>) => void;
  clearSession: () => void;
}

const INITIAL_STATE: SessionState = {
  isRecording: false,
  transcriptChunks: [],
  suggestionBatches: [],
  isLoadingSuggestions: false,
  chatMessages: [],
  isStreamingChat: false,
  secondsUntilRefresh: TIMING.CYCLE_INTERVAL_S,
  error: null,
  lastTranscribeLatency: null,
  lastSuggestionsLatency: null,
  lastBlobSize: null,
};

export const useSessionStore = create<SessionState & SessionActions>()((set) => ({
  ...INITIAL_STATE,

  setRecording: (v) => set({ isRecording: v }),

  addTranscriptChunk: (text) =>
    set((state) => ({
      transcriptChunks: [
        ...state.transcriptChunks,
        {
          id: crypto.randomUUID(),
          text,
          timestamp: Date.now(),
        },
      ],
    })),

  addSuggestionBatch: (suggestions) =>
    set((state) => {
      const batchId = crypto.randomUUID();
      const batch: SuggestionBatch = {
        id: batchId,
        timestamp: Date.now(),
        suggestions: suggestions.map((s) => ({
          ...s,
          id: crypto.randomUUID(),
          batchId,
        })),
      };
      return {
        suggestionBatches: [batch, ...state.suggestionBatches],
      };
    }),

  setLoadingSuggestions: (v) => set({ isLoadingSuggestions: v }),

  addChatMessage: (msg) =>
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        {
          ...msg,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
      ],
    })),

  appendToStreamingMessage: (messageId, delta) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((msg) =>
        msg.id === messageId
          ? { ...msg, content: msg.content + delta }
          : msg
      ),
    })),

  finalizeStreamingMessage: (messageId) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((msg) =>
        msg.id === messageId
          ? { ...msg, isStreaming: false }
          : msg
      ),
      isStreamingChat: false,
    })),

  setStreamingChat: (v) => set({ isStreamingChat: v }),

  setSecondsUntilRefresh: (n) => set({ secondsUntilRefresh: n }),

  setError: (e) => set({ error: e }),

  setDebugMetrics: (metrics) => set((state) => ({ ...state, ...metrics })),

  clearSession: () => set(INITIAL_STATE),
}));
