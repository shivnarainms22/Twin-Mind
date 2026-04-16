# TwinMind Live Suggestions — Architecture, Decisions & Development History

This document covers every architectural decision, what we tried, what worked, what broke, what we improved, and why we chose each approach over the alternatives.

---

## Table of Contents

1. [Tech Stack Decisions](#1-tech-stack-decisions)
2. [Architecture Overview](#2-architecture-overview)
3. [Audio Recording Strategy](#3-audio-recording-strategy)
4. [API Route Design — Why a Server Proxy](#4-api-route-design--why-a-server-proxy)
5. [Transcription Pipeline](#5-transcription-pipeline)
6. [Suggestion Generation System](#6-suggestion-generation-system)
7. [Streaming Chat Implementation](#7-streaming-chat-implementation)
8. [State Management — Two Stores](#8-state-management--two-stores)
9. [Prompt Engineering Journey](#9-prompt-engineering-journey)
10. [Context Windowing Strategy](#10-context-windowing-strategy)
11. [UI/UX Decisions](#11-uiux-decisions)
12. [Bugs Encountered & How We Solved Them](#12-bugs-encountered--how-we-solved-them)
13. [Error Handling Strategy](#13-error-handling-strategy)
14. [Performance Considerations](#14-performance-considerations)
15. [File Structure & Code Organization](#15-file-structure--code-organization)
16. [Development Timeline](#16-development-timeline)
17. [What We Would Do Differently](#17-what-we-would-do-differently)

---

## 1. Tech Stack Decisions

### Next.js 16 (App Router) — over Vite + Express or Vite + no backend

**Chosen**: Next.js 16 with App Router, TypeScript, Tailwind CSS v4, Zustand

**Alternatives considered**:

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Next.js + Tailwind** | API routes as Groq proxy, one codebase, trivial Vercel deploy, SSE streaming native | Heavier than vanilla React | **Chosen** — the API route layer is essential and this gives it for free |
| **Vite + React + Express** | Lighter frontend, familiar separation | Two deployments, more config, separate repos | Rejected — unnecessary complexity |
| **Vite + React (no backend)** | Simplest possible setup | Groq blocks browser CORS, API key exposed in network tab | Rejected — physically cannot work |

**Why Next.js specifically**: We need a backend to proxy Groq API calls (CORS), handle audio file uploads (FormData), and stream SSE responses. Next.js API routes handle all three in the same codebase. Deploying to Vercel is zero-config.

### Tailwind CSS v4 — over raw CSS or CSS-in-JS

**Why**: The reference prototype had a specific dark theme with exact CSS variable values. Tailwind with CSS custom properties let us match it precisely with utility classes, no context-switching to separate stylesheets. We imported the prototype's exact color palette as CSS variables and exposed them via `@theme inline`.

### Zustand — over Redux, Context API, or Jotai

**Why**: Two stores, ~180 lines total. Redux would've been 3x the boilerplate for the same result. Context API causes unnecessary re-renders when any value changes. Zustand's selector pattern (`useStore(s => s.specificField)`) gives fine-grained re-renders and its `persist` middleware gives localStorage sync in one line.

### react-markdown — over dangerouslySetInnerHTML or custom parser

**Why**: AI chat responses contain markdown (headers, bullets, code blocks, tables). We needed safe rendering with no XSS risk. `react-markdown` handles this cleanly. Custom parsing would be fragile; `dangerouslySetInnerHTML` is a security risk. Added after testing showed raw AI text was unreadable.

### No AI SDK (Vercel AI SDK, Groq SDK) — deliberate choice

**Why**: Native `fetch` + Web Streams API handles everything we need:
- Transcription: `fetch` with `FormData` body → JSON response
- Suggestions: `fetch` with JSON body → JSON response
- Chat streaming: `fetch` → `response.body.getReader()` → parse SSE lines

Adding the Vercel AI SDK would add an abstraction layer that obscures the actual HTTP behavior. When debugging streaming issues, we need to see the raw SSE lines, not a wrapper. The total SSE parsing code is ~15 lines. The SDK would be heavier than the code it replaces.

### Webpack — over Turbopack (forced by a bug)

**Why**: Next.js 16 defaults to Turbopack. During development, Turbopack got stuck on "compiling" and never completed — the page hung indefinitely after the first load. Switching to `next dev --webpack` resolved this immediately. We locked it in `package.json` so it never regresses. See [Bug #2](#bug-2-turbopack-stuck-compiling) for details.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser                                                                  │
│                                                                          │
│  ┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │ TranscriptPanel  │    │ SuggestionsPanel  │    │    ChatPanel      │   │
│  │                  │    │                   │    │                   │   │
│  │  MicButton       │    │  Refresh + Timer  │    │  ChatMessage[]    │   │
│  │  TranscriptChunk │    │  SuggestionBatch  │    │  (react-markdown) │   │
│  │  (auto-scroll)   │    │  SuggestionCard   │    │  ChatInput        │   │
│  └────────┬─────────┘    └────────┬──────────┘    └────────┬──────────┘   │
│           │                       │                         │              │
│  ┌────────┴───────────────────────┴─────────────────────────┴──────────┐  │
│  │                     Hooks Layer                                      │  │
│  │  useAudioRecorder  ←→  useSuggestionCycle  ←→  useStreamingChat     │  │
│  └────────┬───────────────────────┬─────────────────────────┬──────────┘  │
│           │                       │                         │              │
│  ┌────────┴───────────────────────┴─────────────────────────┴──────────┐  │
│  │                    Zustand Stores                                    │  │
│  │  useSessionStore (transient)      useSettingsStore (localStorage)    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │ fetch() calls
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Next.js API Routes (server-side, Node.js runtime)                        │
│                                                                          │
│  POST /api/transcribe  →  Groq Whisper Large V3  →  { text, latency }   │
│  POST /api/suggestions →  Groq GPT-OSS 120B      →  { suggestions[] }   │
│  POST /api/chat        →  Groq GPT-OSS 120B      →  SSE stream piped    │
└──────────────────────────────────────────────────────────────────────────┘
```

**Data flow for the 30-second cycle**:
1. MediaRecorder stops → complete audio blob collected
2. Blob sent to `/api/transcribe` → Groq Whisper → text returned
3. Text added to transcript store → UI updates
4. Recent transcript + previous suggestion titles sent to `/api/suggestions`
5. Groq GPT-OSS 120B returns JSON array of 3 suggestions
6. Suggestions added to store → new batch appears at top of panel
7. MediaRecorder restarts → cycle repeats

**Data flow for suggestion click**:
1. User clicks a suggestion card
2. User message added to chat ("Tell me more about: {title}")
3. Suggestion type/title/preview + transcript context sent to `/api/chat`
4. Groq streams SSE response → client reads chunks → message builds word-by-word
5. Stream ends → message finalized

---

## 3. Audio Recording Strategy

### Chosen: Stop/Restart MediaRecorder every 30 seconds

**Three approaches considered**:

| Approach | How it works | Problem |
|---|---|---|
| **Timeslice** | `recorder.start(30000)` fires `ondataavailable` every 30s | Chunks lack WebM headers — Whisper can't decode standalone fragments |
| **AudioWorklet** | Raw PCM capture, manual WAV encoding | Massive over-engineering: WAV header construction, sample rate management, AudioWorklet file, endianness handling. Zero benefit over stop/start |
| **Stop/Restart** | `recorder.stop()` → collect blob → `recorder.start()` | Gap of ~50ms between chunks — imperceptible in speech |

**Stop/Restart wins because**:
- Each blob is a **complete, valid audio file** with headers
- Groq Whisper can decode it immediately
- The ~50ms gap between stop and start is below human perception threshold
- Simple to implement and debug

**MIME type fallback chain** (browser compatibility):
```
audio/webm;codecs=opus  →  audio/webm  →  audio/mp4 (Safari)  →  audio/ogg
```
We use `MediaRecorder.isTypeSupported()` to detect the first supported type. Safari doesn't support WebM, so `audio/mp4` is the fallback.

**Silence detection**: Blobs under 1KB are skipped — they contain only the WebM header with no meaningful audio. This saves Groq API quota and avoids empty transcriptions.

**Stream liveness check**: Before restarting the recorder, we verify `stream.active === true`. If the user's microphone disconnected or the browser revoked permission, we don't crash — we log a warning.

### Callback Refs — solving stale closures

The `onstop` handler runs asynchronously after `recorder.stop()`. If the callback functions (`onAudioChunk`, `onError`) changed between when the handler was created and when it fires, we'd call stale versions.

**Solution**: Store callbacks in `useRef` and update them on every render:
```typescript
const onAudioChunkRef = useRef(onAudioChunk);
onAudioChunkRef.current = onAudioChunk;  // Always current

recorder.onstop = () => {
  onAudioChunkRef.current(blob, mimeType);  // Never stale
};
```

This pattern was introduced in commit `7f9b01b` after debugging the cycle-blocking bug.

---

## 4. API Route Design — Why a Server Proxy

**All Groq API calls go through Next.js API routes. The browser never calls Groq directly.**

### Why proxying is mandatory

1. **CORS**: Groq's API does not set `Access-Control-Allow-Origin` for browser origins. Direct browser → Groq fetch fails with a CORS error. This alone is decisive.

2. **Audio handling**: The transcription endpoint requires multipart `FormData` with a binary audio file. Server-side Node.js handles this more reliably than browser fetch, especially with the buffering fix we had to apply (see [Bug #3](#bug-3-transcription-api-call-hanging)).

3. **Streaming passthrough**: For chat, we pipe `groqResponse.body` directly to the client as an SSE stream. The server acts as a transparent pipe.

### How the API key flows

```
User enters key in Settings → stored in Zustand (localStorage)
    → sent in each request body (JSON or FormData field)
    → API route extracts it → sets as Authorization: Bearer header
    → forwarded to Groq
```

The key never touches server-side storage. It lives only in the client's localStorage and is sent per-request.

### All three API routes use `export const runtime = 'nodejs'`

**Why not Edge Runtime**: Edge Runtime has limitations with `FormData` handling, binary data, and the `Buffer` class. The transcription route specifically needs `Buffer.from(arrayBuffer)` to properly re-encode the audio file. Node.js runtime is the safe choice.

---

## 5. Transcription Pipeline

### Flow

```
Browser (MediaRecorder blob)
    → FormData { audio: Blob, apiKey: string }
    → POST /api/transcribe
    → Buffer audio into memory (fix for Node.js FormData forwarding)
    → Create fresh Blob from Buffer
    → Forward to Groq Whisper: POST https://api.groq.com/openai/v1/audio/transcriptions
    → Return { text: string, latency: number }
```

### Why we buffer the audio (Bug #3 fix)

The `File` object from `request.formData()` in Node.js is lazy — it's backed by a stream. When we tried to append it directly to a new `FormData` for forwarding to Groq, the request hung indefinitely. The fix:

```typescript
const arrayBuffer = await audioFile.arrayBuffer();  // Read fully
const buffer = Buffer.from(arrayBuffer);             // Convert to Buffer
const audioBlob = new Blob([buffer], { type: mimeType }); // Fresh Blob
groqForm.append('file', audioBlob, `audio.${ext}`);  // Now works
```

This was a non-obvious Node.js runtime behavior that wasn't documented anywhere.

### Whisper parameters

```
model: whisper-large-v3
language: en              (improves accuracy for English)
response_format: verbose_json  (includes timestamps and confidence)
```

---

## 6. Suggestion Generation System

### The 30-second cycle orchestration

Located in `useSuggestionCycle.ts`. This is the most architecturally important hook.

```
Every 1 second:
  Decrement countdown (30 → 29 → ... → 1)
  
  When countdown hits 0:
    1. flushAudio()           — stops recorder, collects blob, restarts recorder
    2. transcribeAudio(blob)  — ALWAYS runs, never blocked
    3. if (text exists):
         generateSuggestions() — fire-and-forget, has its own lock
    4. Reset countdown to 30
```

**Critical design**: Transcription and suggestion generation are **decoupled with independent locks**. This was not the original design — it was fixed in commit `7f9b01b` after a critical bug. See [Bug #1](#bug-1-cycle-blocking--the-critical-decoupling-fix).

### Manual refresh flow

When the user clicks "Refresh":
1. `flushAudio()` → stops current recording, collects whatever audio has been captured
2. The `onAudioChunk` callback fires → transcribes → generates suggestions
3. Recorder restarts immediately
4. Countdown resets to 30

This ensures suggestions always reflect the **latest speech**, not stale transcript.

### Suggestion JSON parsing robustness

The model is instructed to return raw JSON, but sometimes it wraps output in markdown fences:

```typescript
let cleaned = raw.trim();
const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
if (fenceMatch) cleaned = fenceMatch[1].trim();
const parsed = JSON.parse(cleaned);
```

We also validate:
- Array is non-empty
- Take first 3 items (in case model returns more)
- Validate each suggestion has `type`, `title`, `preview`
- Unknown types default to `'clarification'`

### Anti-repetition mechanism

Each suggestion batch's titles are stored. When generating a new batch, the last 3 batches' titles (up to 9 titles) are passed to the model:

```
## Previously Generated Suggestions (do NOT repeat these)
- "What error messages appear after the 30-second mark?"
- "Switch to the stable Next.js starter template instead of TurboPack"
- "Check known TurboPack incompatibilities with dynamic child components"
...
```

This prevents the model from cycling through the same suggestions.

---

## 7. Streaming Chat Implementation

### Server side — transparent pipe

```typescript
// /api/chat/route.ts
const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  body: JSON.stringify({ model: 'openai/gpt-oss-120b', stream: true, messages: [...] })
});

// Pipe Groq's SSE stream directly to the client
return new Response(groqResponse.body, {
  headers: { 'Content-Type': 'text/event-stream' }
});
```

No parsing on the server. The raw SSE stream flows through unchanged.

### Client side — ReadableStream reader

```typescript
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';  // Keep incomplete line
  
  for (const line of lines) {
    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
      const json = JSON.parse(line.slice(6));
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) store.appendToStreamingMessage(messageId, delta);
    }
  }
}
```

**Why we buffer incomplete lines**: SSE data can split across `read()` calls. A JSON object might be split mid-way. We only parse lines that end with `\n`, keeping the rest in the buffer for the next read.

### Three-phase message approach

1. **Create placeholder**: `addChatMessage({ role: 'assistant', content: '', isStreaming: true })`
2. **Append deltas**: `appendToStreamingMessage(id, delta)` — updates the message content in real time
3. **Finalize**: `finalizeStreamingMessage(id)` — sets `isStreaming: false`

This lets the UI render the streaming cursor (pulsing blue bar) during phase 2 and remove it in phase 3.

### Suggestion click vs. direct chat — different prompts

When a suggestion is clicked, we use the **detail prompt** with the suggestion's type/title/preview injected. The response format changes per suggestion type (answer gets direct answer + bullets, fact-check gets verdict + correction, etc.).

When the user types directly, we use the **chat prompt** with the transcript as context. The model acts as a meeting-aware assistant.

---

## 8. State Management — Two Stores

### Why two stores instead of one

| Concern | `useSessionStore` | `useSettingsStore` |
|---|---|---|
| Persistence | **Never persisted** — resets on page reload | **localStorage** via Zustand `persist` |
| Content | Transcript, suggestions, chat, recording state, timers, errors, debug metrics | API key, 3 prompts, 3 context windows |
| Rationale | Meeting data is ephemeral per the assignment spec ("No data persistence needed when reloading") | User preferences should survive across sessions |

If we used a single store with `persist`, we'd either persist meeting data (wrong per spec) or lose settings on reload (bad UX).

### Hydration guard

Zustand's `persist` middleware causes a hydration mismatch on first render (server renders default values, client has localStorage values). We guard with:

```typescript
const [hydrated, setHydrated] = useState(false);
useEffect(() => setHydrated(true), []);
if (!hydrated) return null;
```

### Store selector pattern

We select specific slices to avoid unnecessary re-renders:

```typescript
const isRecording = useSessionStore((s) => s.isRecording);     // Only re-renders when this changes
const transcriptChunks = useSessionStore((s) => s.transcriptChunks);  // Only when this changes
```

Not `const store = useSessionStore()` (which re-renders on ANY change).

---

## 9. Prompt Engineering Journey

This is the #1 evaluation criterion. Our prompts went through **3 iterations**.

### Iteration 1: Basic (commit `89a8ae8`)

A simple instruction prompt:
- "Generate exactly 3 suggestions"
- List of 5 types
- "Be specific and concrete"
- JSON output format

**Problem**: Suggestions were generic. Previews told you to "go check" things instead of delivering information. No meeting-type awareness.

### Iteration 2: Transcript priority fix (commit `ae91de0`)

**Problem discovered**: When the user asked "what were the main points that were spoken about?", the chat AI summarized its own previous chat messages (about pagination) instead of the actual meeting transcript.

**Root cause**: The system prompt said "Conversation transcript (for context)" — too weak. The model treated chat history as the primary context.

**Fix**: 
- Renamed to "MEETING TRANSCRIPT (what people are saying in the live conversation — this is your primary source of truth)"
- Added explicit instruction: "When the user asks about 'what was discussed', ALWAYS refer to the MEETING TRANSCRIPT"

### Iteration 3: Major overhaul (commit `2a78437`)

Complete rewrite of all three prompts. Key changes:

**Suggestions prompt — before vs. after**:

| Aspect | Before | After |
|---|---|---|
| Meeting-type awareness | None | Step 1: Assess conversation type (interview, sales call, standup, etc.) |
| Conversational dynamics | None | Detect unanswered questions, factual claims, stuck discussions |
| Preview quality | Advisory ("Consider checking...") | Must deliver standalone value with concrete information |
| Type diversity | "MUST be different types" (rigid) | "Prefer different types, but repeating is fine if warranted" |
| Framing | "Generate suggestions" | "What would a brilliant colleague whisper to you right now?" |
| Bad example | None | Explicit BAD vs GOOD preview examples in the prompt |

**Detail prompt — before vs. after**:

| Aspect | Before | After |
|---|---|---|
| Word limit | 200-400 words | 150-200 words (meetings are brief) |
| Structure | One-size-fits-all | Different format per suggestion type (answer, fact-check, talking-point, question, clarification) |
| Preamble | Not mentioned | "No preamble, no 'Great question!'" |
| Actionability | General | "Include something the speaker could SAY in the meeting" |

**Chat prompt — before vs. after**:

| Aspect | Before | After |
|---|---|---|
| Transcript priority | Weak | Explicit: "ALWAYS answer from MEETING TRANSCRIPT" |
| Help mode | Not supported | "When asked for help, give 2-3 options they could say verbatim" |
| Quoting | Not mentioned | "Quote specific phrases people said" |
| Word limit | None | 200 words default |

---

## 10. Context Windowing Strategy

### Why context windows at all

The transcript grows continuously. A 30-minute meeting produces ~12,000 words (~48,000 chars). Sending all of it for every suggestion request would:
- Waste tokens and money
- Dilute recency (old topics drown out what's happening now)
- Eventually hit model context limits (131k tokens for GPT-OSS 120B, unlikely but possible in very long meetings)

### Default window sizes and rationale

| Operation | Default | Rationale |
|---|---|---|
| Suggestions | 4,000 chars (~2-3 min of speech) | Suggestions should be about what's happening NOW. Too much old context dilutes relevance. |
| Detail expansion | 8,000 chars (~5 min of speech) | Broader context for thorough answers — the user wants depth. |
| Chat | 6,000 chars + chat history | Enough transcript for meeting context, plus conversation continuity. |

### Implementation

```typescript
function getTranscriptWindow(chunks: { text: string }[], maxChars: number): string {
  const fullText = chunks.map((c) => c.text).join(' ');
  if (fullText.length <= maxChars) return fullText;
  return '...' + fullText.slice(-maxChars);  // Take most recent, prefix with ...
}
```

The `...` prefix signals to the model that this is a truncated excerpt, not the start of the conversation.

### Why character-based, not token-based

Counting tokens requires a tokenizer library (tiktoken, etc.) which adds bundle size and is model-dependent. Characters are a good-enough proxy (~4 chars/token for English). All windows are user-configurable in Settings, so users can tune them.

---

## 11. UI/UX Decisions

### Dark theme matching the prototype

We extracted the exact CSS variables from the Claude artifact prototype:

```css
--bg: #0f1115;        --panel: #171a21;      --panel-2: #1d212a;
--border: #272c38;    --text: #e7e9ee;        --muted: #8a93a6;
--accent: #6ea8fe;    --accent-2: #b388ff;    --good: #4ade80;
--warn: #fbbf24;      --danger: #ef4444;
```

### Suggestion type badges — color-coded

| Type | Color | Badge Background |
|---|---|---|
| Question | Blue (#6ea8fe) | `rgba(110,168,254,0.15)` |
| Talking point | Purple (#b388ff) | `rgba(179,136,255,0.15)` |
| Answer | Green (#4ade80) | `rgba(74,222,128,0.15)` |
| Fact-check | Yellow (#fbbf24) | `rgba(251,191,36,0.15)` |
| Clarification | Red (#ef4444) | `rgba(239,68,68,0.15)` |

### Fresh vs. stale batches

The most recent batch has full opacity with blue accent borders. Older batches fade to 55% opacity. This matches the prototype's behavior and provides visual hierarchy.

### Mic button states

- **Idle**: Blue circle with ● symbol, hover darkens
- **Recording**: Red circle with ■ symbol, CSS pulse animation (`box-shadow` keyframes)
- **Disabled**: 50% opacity, `cursor: not-allowed`

### Chat message styling

- **User messages**: Blue-tinted background (`rgba(110,168,254,0.08)`)
- **AI messages**: Neutral dark background + full markdown rendering via `react-markdown` with custom `.prose-chat` CSS (headers, lists, code, tables, blockquotes)
- **Streaming indicator**: Pulsing blue cursor bar (`animate-pulse`)

### Auto-scroll

Both the transcript panel and chat panel auto-scroll to bottom when new content arrives, using:

```typescript
useEffect(() => {
  if (bodyRef.current) {
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }
}, [dataArray]);
```

---

## 12. Bugs Encountered & How We Solved Them

### Bug #1: Cycle blocking — the critical decoupling fix

**Commit**: `7f9b01b`  
**Severity**: Critical — app appeared to stop working after first transcript

**Symptom**: First 30-second transcript appeared correctly. After that, no more transcripts, and suggestions showed "Loading" forever.

**Root cause**: A single `cycleInProgressRef` was guarding both transcription AND suggestion generation:

```typescript
// BEFORE (broken)
const onAudioChunk = async (blob) => {
  if (cycleInProgressRef.current) return;  // ← BLOCKS EVERYTHING
  cycleInProgressRef.current = true;
  const text = await transcribeAudio(blob);
  if (text) await generateSuggestions();    // ← If this hangs, all future audio is lost
  cycleInProgressRef.current = false;
};
```

If `generateSuggestions()` took longer than 30 seconds (or hung), the next `flushAudio()` call would find `cycleInProgressRef.current === true` and return immediately. The audio blob would be discarded. No transcription, no suggestions, no recovery.

**Fix**: Two independent operations with separate locks:

```typescript
// AFTER (fixed)
const onAudioChunk = async (blob) => {
  // ALWAYS transcribe — never skip audio
  const text = await transcribeAudio(blob);
  
  // Suggestions run independently (fire-and-forget, has own lock)
  if (text) generateSuggestions();
};

const generateSuggestions = async () => {
  if (suggestionsInProgressRef.current) return;  // Own lock
  suggestionsInProgressRef.current = true;
  // ... generate ...
  suggestionsInProgressRef.current = false;
};
```

**Lesson**: Never let a slow AI call block audio capture. Audio is real-time and non-recoverable — if you miss it, it's gone.

### Bug #2: Turbopack stuck compiling

**Commit**: `a847f86`  
**Severity**: High — app completely unusable in dev

**Symptom**: After first page load, the browser showed "compiling" at the bottom and never completed. Page was unresponsive. Hard refresh didn't help.

**Root cause**: Next.js 16 defaults to Turbopack as the bundler. Turbopack has known issues with certain code patterns and gets stuck in infinite compilation loops.

**Fix**: Added `--webpack` flag to the dev script:

```json
"dev": "next dev --webpack"
```

Webpack completed compilation reliably every time. First page load takes ~10s (cold compile) but subsequent loads are <50ms.

**Lesson**: When a build tool is stuck, try the alternative before debugging the tool itself.

### Bug #3: Transcription API call hanging

**Commit**: `a847f86`  
**Severity**: High — transcription never returned

**Symptom**: Server logs showed `[transcribe] received blob, size: 421472` but nothing after that — no Groq response, no error, no timeout. The fetch to Groq hung indefinitely.

**Root cause**: Node.js `File` objects from `request.formData()` are lazy/stream-backed. When we appended the File directly to a new `FormData` for forwarding to Groq, the body stream wasn't properly consumed. The request never fully sent to Groq.

**Fix**: Buffer the file into memory first, then create a fresh Blob:

```typescript
// BEFORE (hanging)
groqForm.append('file', audioFile, 'audio.webm');

// AFTER (working)
const arrayBuffer = await audioFile.arrayBuffer();
const buffer = Buffer.from(arrayBuffer);
const audioBlob = new Blob([buffer], { type: mimeType });
groqForm.append('file', audioBlob, `audio.${ext}`);
```

**Lesson**: When forwarding files through Node.js API routes, always buffer into memory first. Stream-backed File objects don't transfer reliably to outgoing requests.

### Bug #4: Chat summarizing itself instead of transcript

**Commit**: `ae91de0`  
**Severity**: Medium — incorrect but not crashing

**Symptom**: User asked "what were the main points that were spoken about?" and the AI summarized its own previous chat message (about pagination) instead of the actual meeting transcript.

**Root cause**: The system message labeled the transcript as "Conversation transcript (for context)" — too weak. The model treated chat history (which was more recent and detailed) as the primary context.

**Fix**: 
- System prompt: "ALWAYS refer to the MEETING TRANSCRIPT, not to your own previous chat messages"
- Label: "MEETING TRANSCRIPT (what people are saying in the live conversation — this is your primary source of truth)"

**Lesson**: When mixing transcript and chat history in context, label them with extreme clarity. The model will default to the more detailed/recent source unless told otherwise.

### Bug #5: Chat responses unreadable

**Commit**: `d698f25`  
**Severity**: Medium — functional but poor UX

**Symptom**: AI responses contained markdown (headers, bullets, code blocks) rendered as raw text with `**`, `#`, `-` characters visible.

**Fix**: Added `react-markdown` for AI messages + 123 lines of `.prose-chat` CSS styling all markdown elements (headers, lists, code, tables, blockquotes) to match the dark theme.

**Lesson**: If your AI outputs markdown (most do), render it as markdown. Raw text is unacceptable for production.

---

## 13. Error Handling Strategy

### Structured API errors

Every API route returns the same error shape:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": "optional extended info",
  "retryAfter": 30
}
```

Error codes: `API_KEY_MISSING`, `INVALID_API_KEY`, `RATE_LIMITED`, `GROQ_ERROR`, `TRANSCRIPT_TOO_SHORT`, `PARSE_ERROR`, `INTERNAL_ERROR`

### Client-side error display

- Errors surface as a red toast bar below the top bar
- Auto-dismiss after 5 seconds
- Dismissable manually with × button
- If API key is missing, Settings modal opens automatically

### Graceful degradation

| Scenario | Behavior |
|---|---|
| Empty transcript (no speech) | Suggestions generation skips silently |
| Silent audio (blob < 1KB) | Transcription skipped, no error shown |
| Suggestion parse failure | Error toast, previous batch stays visible |
| Chat stream interrupted | "(Response interrupted)" appended to message |
| Mic permission denied | Error toast with clear instructions |
| Invalid API key | Error toast, cycle continues trying on next tick |

### Structured logging

Every API route and hook logs with a prefix:

```
[recorder]      — Audio capture events
[cycle]         — Orchestration (flush, transcribe, suggest)
[transcribe]    — Server-side transcription
[suggestions]   — Server-side suggestion generation
[chat]          — Chat streaming events
```

This makes browser console filtering trivial during debugging.

### Debug overlay (Ctrl+Shift+D)

A hidden floating panel showing live metrics:
- Recording state (ON/OFF)
- Next refresh countdown
- Transcript: chunk count + total character count
- Suggestion batch count
- Chat message count
- Loading/streaming states
- Last blob size (KB)
- Last transcribe latency (ms)
- Last suggestions latency (ms)

Invaluable during the live interview demo if something goes wrong.

---

## 14. Performance Considerations

### Latency budget

| Operation | Expected | Notes |
|---|---|---|
| Audio flush + restart | < 50ms | MediaRecorder stop/start gap |
| Groq Whisper transcription | 3-5s | For 30s of audio |
| Groq suggestion generation | 2-4s | JSON response, no streaming |
| Chat time-to-first-token | < 500ms | SSE streaming |
| Total cycle (flush → suggestions visible) | 5-9s | Transcription + generation |

### Optimizations applied

1. **Silence skipping**: Blobs < 1KB not sent to Groq
2. **Context windowing**: Cap transcript to 4K-8K chars instead of entire history
3. **Chat history limit**: Only last 10 messages sent (prevents context bloat)
4. **SSE pipe-through**: Server doesn't parse the stream, just forwards it
5. **Decoupled locks**: Slow suggestions don't block transcription
6. **Fire-and-forget suggestions**: `generateSuggestions()` called without await after transcription

### Rate limit safety

At 30-second cycles: 2 RPM (transcription) + 2 RPM (suggestions) = 4 RPM total. Well within Groq's limits. Chat is user-initiated and unlikely to cause rate limiting.

---

## 15. File Structure & Code Organization

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout, metadata, dark theme
│   ├── page.tsx                  # Main orchestrator (186 lines)
│   ├── globals.css               # Tailwind + CSS vars + animations + markdown styles
│   └── api/
│       ├── transcribe/route.ts   # Audio → Groq Whisper → text (93 lines)
│       ├── suggestions/route.ts  # Transcript → GPT-OSS 120B → 3 suggestions (125 lines)
│       └── chat/route.ts         # Messages → GPT-OSS 120B → SSE stream (70 lines)
│
├── components/                   # UI components (11 files, ~580 lines total)
│   ├── TopBar.tsx                # Title + Settings/Export buttons
│   ├── TranscriptPanel.tsx       # Left column
│   ├── SuggestionsPanel.tsx      # Middle column
│   ├── ChatPanel.tsx             # Right column
│   ├── SuggestionCard.tsx        # Card with type badge
│   ├── SuggestionBatch.tsx       # 3 cards + divider
│   ├── ChatMessage.tsx           # Bubble with markdown rendering
│   ├── ChatInput.tsx             # Input + send
│   ├── MicButton.tsx             # Record toggle
│   ├── SettingsModal.tsx         # Full settings UI
│   └── DebugOverlay.tsx          # Ctrl+Shift+D panel
│
├── hooks/                        # Business logic (3 files, ~476 lines total)
│   ├── useAudioRecorder.ts       # MediaRecorder lifecycle
│   ├── useSuggestionCycle.ts     # 30s orchestration
│   └── useStreamingChat.ts       # SSE consumption
│
├── stores/                       # State management (2 files, ~184 lines total)
│   ├── useSessionStore.ts        # Transient session state
│   └── useSettingsStore.ts       # Persisted settings
│
├── lib/                          # Utilities (3 files, ~161 lines total)
│   ├── prompts.ts                # 3 system prompts
│   ├── constants.ts              # Theme, timing, models
│   └── exportSession.ts          # JSON export builder + downloader
│
└── types/
    └── index.ts                  # All TypeScript interfaces (53 lines)
```

**Total**: 26 source files, ~1,700 lines of application code (excluding config and generated files).

**Design principle**: Each file has a single responsibility. No file exceeds 200 lines. Hooks handle business logic, components handle UI, stores handle state, lib handles utilities.

---

## 16. Development Timeline

| Commit | What happened | Lines changed |
|---|---|---|
| `8524f92` | Next.js 16 scaffold via create-next-app | Boilerplate |
| `89a8ae8` | **Full implementation** — all 26 source files, 3 API routes, 11 components, 3 hooks, 2 stores, types, prompts, constants, export | +1,997 lines |
| `7f9b01b` | **Critical bug fix** — decoupled transcription from suggestions, callback refs | 88+71 lines changed |
| `a847f86` | **Two fixes** — Turbopack → Webpack, transcription route buffering | 32+8 lines changed |
| `d698f25` | **Feature** — markdown rendering for chat with react-markdown + CSS | +1,409 lines (mostly package-lock) |
| `ae91de0` | **Prompt fix** — chat now prioritizes transcript over chat history | 8+4 lines changed |
| `2a78437` | **Major prompt rewrite** — meeting-type detection, structured responses, preview quality | 71+43 lines changed |

---

## 17. What We Would Do Differently

### If starting over

1. **Use Webpack from day one** — would've avoided the Turbopack debugging time
2. **Buffer audio files immediately** — would've avoided the hanging API call
3. **Decouple transcription/suggestions from the start** — the single-lock design was an obvious mistake in hindsight

### Future improvements we'd make with more time

1. **Speaker diarization** — identify who is speaking (Whisper doesn't do this, would need a separate model)
2. **Conversation phase detection** — detect if the meeting is in intro/discussion/decision/wrap-up phase and adapt suggestion types
3. **Suggestion feedback loop** — track which suggestions are clicked and use that signal to improve future batches
4. **Responsive/mobile layout** — current 3-column grid doesn't work on phones
5. **Multiple language support** — remove `language: 'en'` from Whisper, add language selector
6. **WebSocket for real-time updates** — replace polling-style 30s cycle with continuous streaming transcription (would require a different transcription API)
