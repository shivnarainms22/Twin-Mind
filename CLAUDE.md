# TwinMind Live Suggestions

## Tech Stack
- Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Zustand
- Groq API: Whisper Large V3 (transcription), GPT-OSS 120B (suggestions + chat)

## Commands
- `npm run dev` — Start dev server on localhost:3000
- `npm run build` — Production build
- `npm run start` — Start production server

## Project Structure
- `src/app/` — Pages and API routes
- `src/components/` — React components
- `src/hooks/` — Custom hooks (audio recorder, suggestion cycle, streaming chat)
- `src/stores/` — Zustand stores (session state, settings with localStorage persist)
- `src/lib/` — Utility functions, default prompts, constants
- `src/types/` — TypeScript type definitions

## Conventions
- All components are client components (`'use client'`)
- API routes use `export const runtime = 'nodejs'`
- Structured logging with prefixes: `[recorder]`, `[transcribe]`, `[suggestions]`, `[chat]`, `[cycle]`
- Structured API errors: `{ error: string, code: string, details?: string }`
