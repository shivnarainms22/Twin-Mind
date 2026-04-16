'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAudioRecorder } from './useAudioRecorder';
import { TIMING } from '@/lib/constants';

function getTranscriptWindow(chunks: { text: string }[], maxChars: number): string {
  const fullText = chunks.map((c) => c.text).join(' ');
  if (fullText.length <= maxChars) return fullText;
  return '...' + fullText.slice(-maxChars);
}

export function useSuggestionCycle() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const suggestionsInProgressRef = useRef(false);

  // Transcription — always runs, never blocked
  const transcribeAudio = useCallback(async (blob: Blob, mimeType: string): Promise<string | null> => {
    const apiKey = useSettingsStore.getState().apiKey;
    const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';

    useSessionStore.getState().setDebugMetrics({ lastBlobSize: blob.size });

    const formData = new FormData();
    formData.append('audio', blob, `audio.${ext}`);
    formData.append('apiKey', apiKey);

    try {
      console.log('[cycle] sending audio for transcription, size:', blob.size);
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        console.error('[cycle] transcription error:', err);
        useSessionStore.getState().setError({ type: err.code, message: err.error });
        return null;
      }

      const { text, latency } = await response.json() as { text: string; latency: number };
      console.log('[cycle] transcription result:', text.slice(0, 100), '| latency:', latency, 'ms');
      useSessionStore.getState().setDebugMetrics({ lastTranscribeLatency: latency });

      if (text.trim()) {
        useSessionStore.getState().addTranscriptChunk(text.trim());
        return text.trim();
      }
      return null;
    } catch (err) {
      console.error('[cycle] transcription fetch error:', err);
      useSessionStore.getState().setError({ type: 'NETWORK_ERROR', message: 'Network error during transcription' });
      return null;
    }
  }, []);

  // Suggestion generation — has its own lock, never blocks transcription
  const generateSuggestions = useCallback(async () => {
    // Skip if already generating
    if (suggestionsInProgressRef.current) {
      console.log('[cycle] suggestions already in progress, skipping');
      return;
    }

    const { transcriptChunks, suggestionBatches } = useSessionStore.getState();
    const { apiKey, suggestionsPrompt, suggestionsContextWindow } = useSettingsStore.getState();

    if (transcriptChunks.length === 0) {
      console.log('[cycle] no transcript yet, skipping suggestions');
      return;
    }

    const transcript = getTranscriptWindow(transcriptChunks, suggestionsContextWindow);

    // Collect previous titles for anti-repetition (last 3 batches = up to 9 titles)
    const previousTitles = suggestionBatches
      .slice(0, 3)
      .flatMap((b) => b.suggestions.map((s) => s.title));

    suggestionsInProgressRef.current = true;
    useSessionStore.getState().setLoadingSuggestions(true);

    try {
      console.log('[cycle] generating suggestions, transcript context:', transcript.length, 'chars');
      const response = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          previousTitles,
          systemPrompt: suggestionsPrompt,
          apiKey,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        console.error('[cycle] suggestions API error:', err);
        useSessionStore.getState().setError({ type: err.code, message: err.error });
        return;
      }

      const { suggestions, latency } = await response.json() as {
        suggestions: { type: string; title: string; preview: string }[];
        latency: number;
      };
      console.log('[cycle] suggestions received:', suggestions.map((s) => s.type + ': ' + s.title));
      console.log('[cycle] suggestions latency:', latency, 'ms');
      useSessionStore.getState().setDebugMetrics({ lastSuggestionsLatency: latency });
      useSessionStore.getState().addSuggestionBatch(
        suggestions as { type: 'question'; title: string; preview: string }[]
      );
    } catch (err) {
      console.error('[cycle] suggestions fetch error:', err);
      useSessionStore.getState().setError({ type: 'NETWORK_ERROR', message: 'Failed to generate suggestions' });
    } finally {
      suggestionsInProgressRef.current = false;
      useSessionStore.getState().setLoadingSuggestions(false);
    }
  }, []);

  // Audio chunk handler — transcribes first, then triggers suggestions (non-blocking)
  const onAudioChunk = useCallback(async (blob: Blob, mimeType: string) => {
    // Always transcribe — never skip audio
    const text = await transcribeAudio(blob, mimeType);

    // Then generate suggestions (non-blocking — if already in progress, it skips)
    if (text) {
      generateSuggestions(); // fire-and-forget, has its own lock
    }
  }, [transcribeAudio, generateSuggestions]);

  const onRecorderError = useCallback((error: string) => {
    console.error('[cycle] recorder error:', error);
    useSessionStore.getState().setError({ type: 'RECORDER_ERROR', message: error });
    useSessionStore.getState().setRecording(false);
  }, []);

  const { startRecording, stopRecording, flushAudio } = useAudioRecorder({
    onAudioChunk,
    onError: onRecorderError,
  });

  // Manual refresh — flush audio then generate suggestions
  const manualRefresh = useCallback(async () => {
    console.log('[cycle] manual refresh triggered');
    await flushAudio();
    // onAudioChunk handles transcription + suggestion generation
    useSessionStore.getState().setSecondsUntilRefresh(TIMING.CYCLE_INTERVAL_S);
  }, [flushAudio]);

  // Timer management
  useEffect(() => {
    const unsubscribe = useSessionStore.subscribe((state, prevState) => {
      // Started recording
      if (state.isRecording && !prevState.isRecording) {
        console.log('[cycle] recording started, beginning cycle');
        startRecording();
        useSessionStore.getState().setSecondsUntilRefresh(TIMING.CYCLE_INTERVAL_S);

        // Clear any existing interval
        if (intervalRef.current) clearInterval(intervalRef.current);

        intervalRef.current = setInterval(() => {
          const current = useSessionStore.getState().secondsUntilRefresh;
          if (current <= 1) {
            console.log('[cycle] 30s elapsed, flushing audio');
            flushAudio();
            useSessionStore.getState().setSecondsUntilRefresh(TIMING.CYCLE_INTERVAL_S);
          } else {
            useSessionStore.getState().setSecondsUntilRefresh(current - 1);
          }
        }, 1000);
      }

      // Stopped recording
      if (!state.isRecording && prevState.isRecording) {
        console.log('[cycle] recording stopped');
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        stopRecording();
      }
    });

    return () => {
      unsubscribe();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [startRecording, stopRecording, flushAudio]);

  return { manualRefresh };
}
