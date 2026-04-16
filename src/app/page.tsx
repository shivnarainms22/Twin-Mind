'use client';

import { useState, useEffect, useCallback } from 'react';
import TopBar from '@/components/TopBar';
import TranscriptPanel from '@/components/TranscriptPanel';
import SuggestionsPanel from '@/components/SuggestionsPanel';
import ChatPanel from '@/components/ChatPanel';
import SettingsModal from '@/components/SettingsModal';
import DebugOverlay from '@/components/DebugOverlay';
import { useSessionStore } from '@/stores/useSessionStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useSuggestionCycle } from '@/hooks/useSuggestionCycle';
import { useStreamingChat } from '@/hooks/useStreamingChat';
import { buildSessionExport, downloadSessionExport } from '@/lib/exportSession';
import type { Suggestion } from '@/types';

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  // Session store
  const isRecording = useSessionStore((s) => s.isRecording);
  const transcriptChunks = useSessionStore((s) => s.transcriptChunks);
  const suggestionBatches = useSessionStore((s) => s.suggestionBatches);
  const chatMessages = useSessionStore((s) => s.chatMessages);
  const isStreamingChat = useSessionStore((s) => s.isStreamingChat);
  const isLoadingSuggestions = useSessionStore((s) => s.isLoadingSuggestions);
  const secondsUntilRefresh = useSessionStore((s) => s.secondsUntilRefresh);
  const error = useSessionStore((s) => s.error);
  const setRecording = useSessionStore((s) => s.setRecording);
  const setError = useSessionStore((s) => s.setError);

  // Settings store
  const settings = useSettingsStore();
  const apiKey = useSettingsStore((s) => s.apiKey);

  // Hooks
  const { manualRefresh } = useSuggestionCycle();
  const { sendMessage } = useStreamingChat();

  const handleToggleRecording = useCallback(() => {
    if (!apiKey) {
      setSettingsOpen(true);
      setError({ type: 'API_KEY_MISSING', message: 'Please set your Groq API key in Settings.' });
      return;
    }
    setRecording(!isRecording);
  }, [apiKey, isRecording, setRecording, setError]);

  const handleSuggestionClick = useCallback((suggestion: Suggestion) => {
    const message = `Tell me more about: ${suggestion.title}\n\n${suggestion.preview}`;
    sendMessage(message, suggestion);
  }, [sendMessage]);

  const handleSendMessage = useCallback((message: string) => {
    if (!apiKey) {
      setSettingsOpen(true);
      return;
    }
    sendMessage(message);
  }, [apiKey, sendMessage]);

  const handleExport = useCallback(() => {
    const data = buildSessionExport(transcriptChunks, suggestionBatches, chatMessages);
    downloadSessionExport(data);
  }, [transcriptChunks, suggestionBatches, chatMessages]);

  // Auto-dismiss errors
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error, setError]);

  if (!hydrated) return null;

  return (
    <div className="h-full flex flex-col">
      <TopBar
        onOpenSettings={() => setSettingsOpen(true)}
        onExport={handleExport}
      />

      {/* Error toast */}
      {error && (
        <div className="mx-3 mt-2 px-4 py-2.5 bg-[rgba(239,68,68,0.1)] border border-danger/30 rounded-lg text-sm text-danger flex justify-between items-center animate-fadein">
          <span>{error.message}</span>
          <button onClick={() => setError(null)} className="text-danger/60 hover:text-danger ml-3">&times;</button>
        </div>
      )}

      <div className="flex-1 grid grid-cols-3 gap-3 p-3 min-h-0">
        <TranscriptPanel
          isRecording={isRecording}
          onToggleRecording={handleToggleRecording}
          transcriptChunks={transcriptChunks}
        />
        <SuggestionsPanel
          suggestionBatches={suggestionBatches}
          onSuggestionClick={handleSuggestionClick}
          onRefresh={manualRefresh}
          secondsUntilRefresh={secondsUntilRefresh}
          isLoading={isLoadingSuggestions}
          isRecording={isRecording}
        />
        <ChatPanel
          messages={chatMessages}
          onSendMessage={handleSendMessage}
          isStreaming={isStreamingChat}
        />
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={{
          apiKey: settings.apiKey,
          suggestionsPrompt: settings.suggestionsPrompt,
          detailPrompt: settings.detailPrompt,
          chatPrompt: settings.chatPrompt,
          suggestionsContextWindow: settings.suggestionsContextWindow,
          detailContextWindow: settings.detailContextWindow,
          chatContextWindow: settings.chatContextWindow,
        }}
        onSave={(s) => settings.updateSettings(s)}
        onReset={() => settings.resetToDefaults()}
      />

      <DebugOverlay />
    </div>
  );
}
