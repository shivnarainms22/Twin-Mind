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
  const cycleInProgressRef = useRef(false);

  // Transcription function
  const transcribeAudio = useCallback(async (blob: Blob, mimeType: string) => {
    const apiKey = useSettingsStore.getState().apiKey;
    const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';

    useSessionStore.getState().setDebugMetrics({ lastBlobSize: blob.size });

    const formData = new FormData();
    formData.append('audio', blob, `audio.${ext}`);
    formData.append('apiKey', apiKey);

    try {
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
      console.log('[cycle] transcription result:', text.slice(0, 100), 'latency:', latency, 'ms');
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

  // Generate suggestions
  const generateSuggestions = useCallback(async () => {
    const { transcriptChunks, suggestionBatches } = useSessionStore.getState();
    const { apiKey, suggestionsPrompt, suggestionsContextWindow } = useSettingsStore.getState();

    if (transcriptChunks.length === 0) return;

    const transcript = getTranscriptWindow(transcriptChunks, suggestionsContextWindow);

    // Collect previous titles for anti-repetition (last 3 batches = up to 9 titles)
    const previousTitles = suggestionBatches
      .slice(0, 3)
      .flatMap((b) => b.suggestions.map((s) => s.title));

    useSessionStore.getState().setLoadingSuggestions(true);

    try {
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
        console.error('[cycle] suggestions error:', err);
        useSessionStore.getState().setError({ type: err.code, message: err.error });
        return;
      }

      const { suggestions, latency } = await response.json() as {
        suggestions: { type: string; title: string; preview: string }[];
        latency: number;
      };
      console.log('[cycle] suggestions received:', suggestions.length, 'latency:', latency, 'ms');
      useSessionStore.getState().setDebugMetrics({ lastSuggestionsLatency: latency });
      useSessionStore.getState().addSuggestionBatch(suggestions as { type: 'question'; title: string; preview: string }[]);
    } catch (err) {
      console.error('[cycle] suggestions fetch error:', err);
      useSessionStore.getState().setError({ type: 'NETWORK_ERROR', message: 'Network error during suggestion generation' });
    } finally {
      useSessionStore.getState().setLoadingSuggestions(false);
    }
  }, []);

  // Audio chunk handler — called when recorder flushes
  const onAudioChunk = useCallback(async (blob: Blob, mimeType: string) => {
    if (cycleInProgressRef.current) return;
    cycleInProgressRef.current = true;

    try {
      const text = await transcribeAudio(blob, mimeType);
      if (text) {
        await generateSuggestions();
      }
    } finally {
      cycleInProgressRef.current = false;
    }
  }, [transcribeAudio, generateSuggestions]);

  const onRecorderError = useCallback((error: string) => {
    useSessionStore.getState().setError({ type: 'RECORDER_ERROR', message: error });
    useSessionStore.getState().setRecording(false);
  }, []);

  const { startRecording, stopRecording, flushAudio } = useAudioRecorder({
    onAudioChunk,
    onError: onRecorderError,
  });

  // Manual refresh — flush audio then generate suggestions
  const manualRefresh = useCallback(async () => {
    if (cycleInProgressRef.current) return;
    await flushAudio();
    // The onAudioChunk callback will handle transcription + suggestion generation
    useSessionStore.getState().setSecondsUntilRefresh(TIMING.CYCLE_INTERVAL_S);
  }, [flushAudio]);

  // Timer management
  useEffect(() => {
    const isRecording = useSessionStore.getState().isRecording;

    const unsubscribe = useSessionStore.subscribe((state, prevState) => {
      // Started recording
      if (state.isRecording && !prevState.isRecording) {
        startRecording();
        useSessionStore.getState().setSecondsUntilRefresh(TIMING.CYCLE_INTERVAL_S);

        intervalRef.current = setInterval(() => {
          const current = useSessionStore.getState().secondsUntilRefresh;
          if (current <= 1) {
            // Time to flush and generate
            flushAudio();
            useSessionStore.getState().setSecondsUntilRefresh(TIMING.CYCLE_INTERVAL_S);
          } else {
            useSessionStore.getState().setSecondsUntilRefresh(current - 1);
          }
        }, 1000);
      }

      // Stopped recording
      if (!state.isRecording && prevState.isRecording) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        stopRecording();
      }
    });

    // If already recording on mount (shouldn't happen, but safety)
    if (isRecording) {
      startRecording();
    }

    return () => {
      unsubscribe();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [startRecording, stopRecording, flushAudio]);

  return { manualRefresh };
}
