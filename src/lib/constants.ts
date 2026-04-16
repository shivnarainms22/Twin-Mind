import type { SuggestionType } from '@/types';

export const SUGGESTION_TYPE_CONFIG: Record<SuggestionType, { label: string; badgeClass: string }> = {
  'question': {
    label: 'Question to ask',
    badgeClass: 'bg-[rgba(110,168,254,0.15)] text-accent',
  },
  'talking-point': {
    label: 'Talking point',
    badgeClass: 'bg-[rgba(179,136,255,0.15)] text-accent-2',
  },
  'answer': {
    label: 'Answer',
    badgeClass: 'bg-[rgba(74,222,128,0.15)] text-good',
  },
  'fact-check': {
    label: 'Fact-check',
    badgeClass: 'bg-[rgba(251,191,36,0.15)] text-warn',
  },
  'clarification': {
    label: 'Clarification',
    badgeClass: 'bg-[rgba(239,68,68,0.15)] text-danger',
  },
};

export const TIMING = {
  CYCLE_INTERVAL_S: 30,
  MIN_BLOB_SIZE: 1024,
} as const;

export const MODELS = {
  TRANSCRIPTION: 'whisper-large-v3',
  CHAT: 'openai/gpt-oss-120b',
} as const;

export const DEFAULT_CONTEXT_WINDOWS = {
  suggestions: 4000,
  detail: 8000,
  chat: 6000,
} as const;
