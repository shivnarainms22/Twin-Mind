# TwinMind — Live Suggestions

A real-time AI meeting copilot that listens to your microphone, transcribes speech, and surfaces contextually relevant suggestions every 30 seconds. Clicking a suggestion delivers a detailed AI-generated answer in a chat panel.

## Live Demo

> **[Deployed URL will be added after Vercel deployment]**

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Settings**, paste your [Groq API key](https://console.groq.com/keys), and click the mic button to start.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) | API routes as Groq proxy, Vercel deploy, single codebase |
| Styling | Tailwind CSS v4 | Rapid dark-theme UI matching the reference prototype |
| State | Zustand | Lightweight, two stores: session (ephemeral) + settings (persisted) |
| Transcription | Groq Whisper Large V3 | Fast, accurate STT via `whisper-large-v3` |
| AI (suggestions + chat) | Groq GPT-OSS 120B | `openai/gpt-oss-120b` — fast inference at ~500 tok/s |
| Deployment | Vercel | Zero-config for Next.js, free tier, HTTPS |

## Architecture

```
Browser (MediaRecorder) → /api/transcribe → Groq Whisper → transcript
         ↓ (every 30s)
transcript context → /api/suggestions → GPT-OSS 120B → 3 suggestion cards
         ↓ (on click or type)
suggestion + transcript → /api/chat → GPT-OSS 120B (streaming SSE) → chat response
```

All Groq API calls are proxied through Next.js API routes (Groq does not support browser CORS). The user's API key is sent per-request, never stored server-side.

## Prompt Strategy

### Live Suggestions (highest priority)
The suggestion prompt is designed to produce **context-aware, varied, and immediately useful** cards:

1. **Recency bias**: The prompt explicitly prioritizes the most recent portion of the transcript — what's happening NOW matters most.
2. **Type diversity**: The model must produce different suggestion types (question, talking-point, answer, fact-check, clarification) — never 3 of the same.
3. **Anti-repetition**: Previous suggestion titles (last 3 batches, up to 9 titles) are passed as a "do not repeat" list. This prevents cycling and forces fresh angles.
4. **Specificity enforcement**: The prompt demands concrete references to actual topics, names, numbers, and claims from the transcript — no generic suggestions.
5. **Context-aware selection**: The prompt describes when each type is most appropriate (e.g., "if someone asked a question that wasn't answered → suggest an answer"), letting the model choose the right mix.

### Detail Expansion (on suggestion click)
Uses a broader transcript context window (8,000 chars vs 4,000 for suggestions) to provide thorough, structured answers with bullet points and headers for quick scanning during a meeting.

### Chat
Full transcript context + conversation history for continuity. Concise, meeting-appropriate responses.

### All prompts are editable in Settings
Users can modify the system prompts and context window sizes to tune the experience.

## Context Windowing

| Operation | Default Window | Rationale |
|---|---|---|
| Suggestions | 4,000 chars (~2-3 min) | Recency matters most |
| Detail expansion | 8,000 chars (~5 min) | Broader context for thorough answers |
| Chat | 6,000 chars + chat history | Balance of context and conversation |

## Features

- **Mic + Transcript**: Start/stop recording, transcript appends every ~30s with timestamps, auto-scrolls
- **Live Suggestions**: 3 context-aware suggestion cards every ~30s, manual refresh button, colored type badges, newest at top with older batches faded below
- **Chat**: Click suggestion for detailed answer (streamed), type questions directly, one continuous session
- **Settings**: Groq API key, editable prompts, configurable context windows, reset to defaults
- **Export**: Full session export (transcript + all suggestion batches + chat history with timestamps) as JSON
- **Debug Overlay**: Press `Ctrl+Shift+D` to show API latencies, blob sizes, transcript length, and recording state

## Tradeoffs

1. **Stop/restart vs timeslice for audio**: Chose stop/restart MediaRecorder every 30s. Each chunk is a complete valid audio file for Whisper. Timeslice chunks lack headers and aren't independently decodable. The ~50ms gap between stop and start is imperceptible.

2. **No AI SDK dependency**: Used native `fetch` + Web Streams API for SSE streaming instead of Vercel AI SDK. Fewer abstractions, smaller bundle, easier to debug. The SSE parsing is straightforward (< 30 lines).

3. **Character-based context windows**: Used character count instead of token count for context windowing. Avoids needing a tokenizer library (bundle size) while being a good-enough proxy (~4 chars/token for English).

4. **Two Zustand stores**: Session state is ephemeral (resets on reload per spec). Settings are persisted to localStorage. This separation prevents accidental persistence of meeting data.

5. **Server-side API proxy**: Even though keys come from the user, all Groq calls go through API routes. This avoids CORS issues and keeps keys out of browser network tab exposure to extensions.
