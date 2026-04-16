'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SUGGESTIONS_PROMPT, DEFAULT_DETAIL_PROMPT, DEFAULT_CHAT_PROMPT } from '@/lib/prompts';
import { DEFAULT_CONTEXT_WINDOWS } from '@/lib/constants';

export interface SettingsState {
  apiKey: string;
  suggestionsPrompt: string;
  detailPrompt: string;
  chatPrompt: string;
  suggestionsContextWindow: number;
  detailContextWindow: number;
  chatContextWindow: number;
}

interface SettingsActions {
  updateSettings: (settings: Partial<SettingsState>) => void;
  resetToDefaults: () => void;
}

const DEFAULT_SETTINGS: SettingsState = {
  apiKey: '',
  suggestionsPrompt: DEFAULT_SUGGESTIONS_PROMPT,
  detailPrompt: DEFAULT_DETAIL_PROMPT,
  chatPrompt: DEFAULT_CHAT_PROMPT,
  suggestionsContextWindow: DEFAULT_CONTEXT_WINDOWS.suggestions,
  detailContextWindow: DEFAULT_CONTEXT_WINDOWS.detail,
  chatContextWindow: DEFAULT_CONTEXT_WINDOWS.chat,
};

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      updateSettings: (updates) => set((state) => ({ ...state, ...updates })),
      resetToDefaults: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'twinmind-settings',
    }
  )
);
