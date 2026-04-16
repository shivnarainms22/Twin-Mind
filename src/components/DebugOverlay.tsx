'use client';

import { useState, useEffect } from 'react';
import { useSessionStore } from '@/stores/useSessionStore';

export default function DebugOverlay() {
  const [visible, setVisible] = useState(false);

  const isRecording = useSessionStore((s) => s.isRecording);
  const transcriptChunks = useSessionStore((s) => s.transcriptChunks);
  const suggestionBatches = useSessionStore((s) => s.suggestionBatches);
  const chatMessages = useSessionStore((s) => s.chatMessages);
  const secondsUntilRefresh = useSessionStore((s) => s.secondsUntilRefresh);
  const isLoadingSuggestions = useSessionStore((s) => s.isLoadingSuggestions);
  const isStreamingChat = useSessionStore((s) => s.isStreamingChat);
  const lastTranscribeLatency = useSessionStore((s) => s.lastTranscribeLatency);
  const lastSuggestionsLatency = useSessionStore((s) => s.lastSuggestionsLatency);
  const lastBlobSize = useSessionStore((s) => s.lastBlobSize);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!visible) return null;

  const totalTranscriptChars = transcriptChunks.reduce((acc, c) => acc + c.text.length, 0);

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-panel border border-border rounded-lg p-4 text-xs font-mono text-muted shadow-lg max-w-xs">
      <div className="flex justify-between items-center mb-2">
        <span className="text-accent font-semibold uppercase tracking-wider">Debug</span>
        <button onClick={() => setVisible(false)} className="text-muted hover:text-text">&times;</button>
      </div>
      <div className="space-y-1">
        <div>Recording: <span className={isRecording ? 'text-good' : 'text-muted'}>{isRecording ? 'ON' : 'OFF'}</span></div>
        <div>Next refresh: {secondsUntilRefresh}s</div>
        <div>Transcript: {transcriptChunks.length} chunks, {totalTranscriptChars} chars</div>
        <div>Batches: {suggestionBatches.length}</div>
        <div>Chat msgs: {chatMessages.length}</div>
        <div>Suggestions loading: {isLoadingSuggestions ? 'YES' : 'no'}</div>
        <div>Chat streaming: {isStreamingChat ? 'YES' : 'no'}</div>
        <hr className="border-border my-1.5" />
        <div>Last blob: {lastBlobSize ? `${(lastBlobSize / 1024).toFixed(1)} KB` : '—'}</div>
        <div>Transcribe latency: {lastTranscribeLatency ? `${lastTranscribeLatency}ms` : '—'}</div>
        <div>Suggestions latency: {lastSuggestionsLatency ? `${lastSuggestionsLatency}ms` : '—'}</div>
      </div>
      <div className="mt-2 text-[10px] text-muted/60">Ctrl+Shift+D to toggle</div>
    </div>
  );
}
