'use client';

import { useState, useEffect } from 'react';

interface Settings {
  apiKey: string;
  suggestionsPrompt: string;
  detailPrompt: string;
  chatPrompt: string;
  suggestionsContextWindow: number;
  detailContextWindow: number;
  chatContextWindow: number;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (settings: Settings) => void;
  onReset: () => void;
}

export default function SettingsModal({ isOpen, onClose, settings, onSave, onReset }: SettingsModalProps) {
  const [local, setLocal] = useState<Settings>(settings);

  useEffect(() => {
    setLocal(settings);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(local);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-panel border border-border rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="text-muted hover:text-text text-xl leading-none">&times;</button>
        </div>

        {/* API Key */}
        <div className="mb-5">
          <label className="block text-xs uppercase tracking-wider text-muted mb-1.5">Groq API Key</label>
          <input
            type="password"
            value={local.apiKey}
            onChange={(e) => update('apiKey', e.target.value)}
            placeholder="gsk_..."
            className="w-full bg-panel-2 border border-border text-text px-3 py-2 rounded-md text-sm focus:outline-none focus:border-accent"
          />
        </div>

        {/* Prompts */}
        {([
          ['suggestionsPrompt', 'Live Suggestions Prompt'],
          ['detailPrompt', 'Detail Answer Prompt (on click)'],
          ['chatPrompt', 'Chat Prompt'],
        ] as const).map(([key, label]) => (
          <div key={key} className="mb-5">
            <label className="block text-xs uppercase tracking-wider text-muted mb-1.5">{label}</label>
            <textarea
              value={local[key]}
              onChange={(e) => update(key, e.target.value)}
              rows={6}
              className="w-full bg-panel-2 border border-border text-text px-3 py-2 rounded-md text-xs font-mono leading-relaxed focus:outline-none focus:border-accent resize-y"
            />
          </div>
        ))}

        {/* Context Windows */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          {([
            ['suggestionsContextWindow', 'Suggestions Context (chars)'],
            ['detailContextWindow', 'Detail Context (chars)'],
            ['chatContextWindow', 'Chat Context (chars)'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs uppercase tracking-wider text-muted mb-1.5">{label}</label>
              <input
                type="number"
                value={local[key]}
                onChange={(e) => update(key, parseInt(e.target.value) || 0)}
                className="w-full bg-panel-2 border border-border text-text px-3 py-2 rounded-md text-sm focus:outline-none focus:border-accent"
              />
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex justify-between">
          <button
            onClick={() => { onReset(); onClose(); }}
            className="text-xs text-muted hover:text-danger transition-colors"
          >
            Reset to Defaults
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted border border-border rounded-md hover:border-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm bg-accent text-black rounded-md font-medium hover:bg-accent/80"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
