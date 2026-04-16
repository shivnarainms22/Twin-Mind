'use client';

import { useCallback } from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { Suggestion } from '@/types';

function getTranscriptWindow(chunks: { text: string }[], maxChars: number): string {
  const fullText = chunks.map((c) => c.text).join(' ');
  if (fullText.length <= maxChars) return fullText;
  return '...' + fullText.slice(-maxChars);
}

export function useStreamingChat() {
  const sendMessage = useCallback(async (
    userMessage: string,
    sourceSuggestion?: Suggestion
  ) => {
    const store = useSessionStore.getState();
    const settings = useSettingsStore.getState();

    if (store.isStreamingChat) return;

    // Add user message
    store.addChatMessage({
      role: 'user',
      content: userMessage,
      sourceSuggestionTitle: sourceSuggestion?.title,
    });

    // Determine prompt and context window based on whether this is a suggestion click or direct chat
    let systemPrompt: string;
    let contextWindow: number;

    if (sourceSuggestion) {
      // Suggestion click — use detail prompt with suggestion context
      systemPrompt = `${settings.detailPrompt}\n\n## Suggestion the user wants to explore\nType: ${sourceSuggestion.type}\nTitle: ${sourceSuggestion.title}\nPreview: ${sourceSuggestion.preview}`;
      contextWindow = settings.detailContextWindow;
    } else {
      // Direct chat
      systemPrompt = settings.chatPrompt;
      contextWindow = settings.chatContextWindow;
    }

    const transcript = getTranscriptWindow(store.transcriptChunks, contextWindow);

    // Build messages for API (last few messages for context)
    const recentMessages = store.chatMessages
      .filter((m) => !m.isStreaming)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    // Add current user message
    recentMessages.push({ role: 'user', content: userMessage });

    // Create placeholder assistant message
    store.addChatMessage({
      role: 'assistant',
      content: '',
      isStreaming: true,
    });
    store.setStreamingChat(true);

    // Get the ID of the message we just added
    const assistantMessageId = useSessionStore.getState().chatMessages[
      useSessionStore.getState().chatMessages.length - 1
    ].id;

    try {
      console.log('[chat] sending request, transcript:', transcript.length, 'chars');

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: recentMessages,
          systemPrompt,
          transcript,
          apiKey: settings.apiKey,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        console.error('[chat] API error:', err);
        useSessionStore.getState().appendToStreamingMessage(assistantMessageId, `Error: ${err.error}`);
        useSessionStore.getState().finalizeStreamingMessage(assistantMessageId);
        return;
      }

      // Read the SSE stream
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              useSessionStore.getState().appendToStreamingMessage(assistantMessageId, delta);
            }
          } catch {
            // Ignore parse errors for incomplete chunks
          }
        }
      }

      console.log('[chat] stream complete');
    } catch (err) {
      console.error('[chat] stream error:', err);
      useSessionStore.getState().appendToStreamingMessage(assistantMessageId, '\n\n(Response interrupted)');
    } finally {
      useSessionStore.getState().finalizeStreamingMessage(assistantMessageId);
    }
  }, []);

  return { sendMessage };
}
