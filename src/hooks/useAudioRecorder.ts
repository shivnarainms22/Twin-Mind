'use client';

import { useRef, useCallback } from 'react';

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
];

function getSupportedMimeType(): string {
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) {
      console.log('[recorder] using mimeType:', type);
      return type;
    }
  }
  console.warn('[recorder] no preferred mimeType supported, using default');
  return '';
}

interface UseAudioRecorderOptions {
  onAudioChunk: (blob: Blob, mimeType: string) => void;
  onError: (error: string) => void;
}

export function useAudioRecorder({ onAudioChunk, onError }: UseAudioRecorderOptions) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('');
  // Use refs for callbacks to avoid stale closures in onstop handlers
  const onAudioChunkRef = useRef(onAudioChunk);
  const onErrorRef = useRef(onError);
  onAudioChunkRef.current = onAudioChunk;
  onErrorRef.current = onError;

  const createAndStartRecorder = useCallback((stream: MediaStream) => {
    const mimeType = mimeTypeRef.current;
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onerror = () => {
      console.error('[recorder] MediaRecorder error event');
      onErrorRef.current('Recording error occurred');
    };

    recorder.start();
    console.log('[recorder] recorder started, state:', recorder.state);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeTypeRef.current = getSupportedMimeType();
      createAndStartRecorder(stream);
    } catch (err) {
      const error = err as DOMException;
      console.error('[recorder] getUserMedia error:', error.name, error.message);
      if (error.name === 'NotAllowedError') {
        onErrorRef.current('Microphone access denied. Please allow microphone access in your browser settings.');
      } else if (error.name === 'NotFoundError') {
        onErrorRef.current('No microphone found. Please connect a microphone.');
      } else {
        onErrorRef.current(`Microphone error: ${error.message}`);
      }
    }
  }, [createAndStartRecorder]);

  const flushAudio = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== 'recording') {
        console.warn('[recorder] flush skipped — recorder state:', recorder?.state || 'null');
        resolve();
        return;
      }

      // Set the onstop handler BEFORE calling stop()
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeTypeRef.current || 'audio/webm',
        });
        chunksRef.current = [];
        console.log('[recorder] flushed audio, blob size:', blob.size, 'bytes');

        // Send chunk for processing (async, non-blocking)
        if (blob.size > 1024) {
          onAudioChunkRef.current(blob, mimeTypeRef.current || 'audio/webm');
        } else {
          console.log('[recorder] blob too small (<1KB), skipping transcription');
        }

        // Restart recording immediately with fresh recorder
        if (streamRef.current && streamRef.current.active) {
          createAndStartRecorder(streamRef.current);
        } else {
          console.warn('[recorder] stream no longer active, cannot restart');
        }

        resolve();
      };

      recorder.stop();
    });
  }, [createAndStartRecorder]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeTypeRef.current || 'audio/webm',
        });
        chunksRef.current = [];
        if (blob.size > 1024) {
          onAudioChunkRef.current(blob, mimeTypeRef.current || 'audio/webm');
        }
      };
      recorder.stop();
    }
    mediaRecorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    console.log('[recorder] stopped and cleaned up');
  }, []);

  return { startRecording, stopRecording, flushAudio };
}
