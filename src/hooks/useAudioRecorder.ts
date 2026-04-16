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

function getFileExtension(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
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

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onerror = () => {
        console.error('[recorder] MediaRecorder error');
        onError('Recording error occurred');
      };

      recorder.start();
      console.log('[recorder] started recording');
    } catch (err) {
      const error = err as DOMException;
      console.error('[recorder] getUserMedia error:', error.name, error.message);
      if (error.name === 'NotAllowedError') {
        onError('Microphone access denied. Please allow microphone access in your browser settings.');
      } else if (error.name === 'NotFoundError') {
        onError('No microphone found. Please connect a microphone.');
      } else {
        onError(`Microphone error: ${error.message}`);
      }
    }
  }, [onError]);

  const flushAudio = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== 'recording') {
        resolve();
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeTypeRef.current || 'audio/webm',
        });
        chunksRef.current = [];
        console.log('[recorder] flushed audio, blob size:', blob.size, 'bytes');

        if (blob.size > 1024) {
          onAudioChunk(blob, mimeTypeRef.current || 'audio/webm');
        } else {
          console.log('[recorder] blob too small, skipping');
        }

        // Restart recording immediately
        if (streamRef.current) {
          const newRecorder = new MediaRecorder(
            streamRef.current,
            mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : undefined
          );
          mediaRecorderRef.current = newRecorder;
          newRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              chunksRef.current.push(e.data);
            }
          };
          newRecorder.onerror = () => {
            onError('Recording error occurred');
          };
          newRecorder.start();
          console.log('[recorder] restarted recording');
        }
        resolve();
      };

      recorder.stop();
    });
  }, [onAudioChunk, onError]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.onstop = () => {
        // Final flush - send last chunk
        const blob = new Blob(chunksRef.current, {
          type: mimeTypeRef.current || 'audio/webm',
        });
        chunksRef.current = [];
        if (blob.size > 1024) {
          onAudioChunk(blob, mimeTypeRef.current || 'audio/webm');
        }
      };
      recorder.stop();
    }
    mediaRecorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    console.log('[recorder] stopped recording');
  }, [onAudioChunk]);

  return { startRecording, stopRecording, flushAudio };
}
