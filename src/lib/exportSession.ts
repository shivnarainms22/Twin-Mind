import type { TranscriptChunk, SuggestionBatch, ChatMessage, SessionExport } from '@/types';

export function buildSessionExport(
  transcriptChunks: TranscriptChunk[],
  suggestionBatches: SuggestionBatch[],
  chatMessages: ChatMessage[]
): SessionExport {
  return {
    exportedAt: new Date().toISOString(),
    transcript: transcriptChunks.map((c) => ({
      text: c.text,
      timestamp: new Date(c.timestamp).toISOString(),
    })),
    suggestionBatches: suggestionBatches.map((b) => ({
      timestamp: new Date(b.timestamp).toISOString(),
      suggestions: b.suggestions.map((s) => ({
        type: s.type,
        title: s.title,
        preview: s.preview,
      })),
    })),
    chat: chatMessages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: new Date(m.timestamp).toISOString(),
      ...(m.sourceSuggestionTitle ? { sourceSuggestion: m.sourceSuggestionTitle } : {}),
    })),
  };
}

export function downloadSessionExport(data: SessionExport) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `twinmind-session-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
