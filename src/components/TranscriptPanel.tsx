'use client';

import { useEffect, useRef } from 'react';
import type { TranscriptChunk } from '@/types';
import MicButton from './MicButton';

interface TranscriptPanelProps {
  isRecording: boolean;
  onToggleRecording: () => void;
  transcriptChunks: TranscriptChunk[];
  micDisabled?: boolean;
}

export default function TranscriptPanel({
  isRecording,
  onToggleRecording,
  transcriptChunks,
  micDisabled,
}: TranscriptPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [transcriptChunks]);

  return (
    <div className="bg-panel border border-border rounded-[10px] flex flex-col overflow-hidden min-h-0">
      <header className="px-3.5 py-2.5 border-b border-border text-xs uppercase tracking-wider text-muted flex justify-between items-center">
        <span>Transcript</span>
        <span>{isRecording ? '● recording' : 'idle'}</span>
      </header>

      <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border">
        <MicButton
          isRecording={isRecording}
          onClick={onToggleRecording}
          disabled={micDisabled}
        />
        <div className="text-[13px] text-muted">
          {isRecording
            ? 'Listening… transcript updates every 30s.'
            : 'Click mic to start. Transcript appends every ~30s.'}
        </div>
      </div>

      <div ref={bodyRef} className="flex-1 overflow-y-auto p-3.5">
        {transcriptChunks.length === 0 ? (
          <div className="text-muted text-[13px] text-center py-8 leading-relaxed">
            No transcript yet — start the mic.
          </div>
        ) : (
          transcriptChunks.map((chunk) => {
            const time = new Date(chunk.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            return (
              <div key={chunk.id} className="text-sm leading-relaxed mb-2.5 text-[#cfd3dc] animate-fadein">
                <span className="text-muted text-[11px] mr-1.5">{time}</span>
                {chunk.text}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
