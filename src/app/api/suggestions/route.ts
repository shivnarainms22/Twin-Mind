export const runtime = 'nodejs';

import type { SuggestionType } from '@/types';

interface SuggestionRaw {
  type: string;
  title: string;
  preview: string;
}

const VALID_TYPES: SuggestionType[] = ['question', 'talking-point', 'answer', 'fact-check', 'clarification'];

function validateType(t: string): SuggestionType {
  if (VALID_TYPES.includes(t as SuggestionType)) return t as SuggestionType;
  return 'clarification';
}

function parseSuggestions(raw: string): { type: SuggestionType; title: string; preview: string }[] {
  let cleaned = raw.trim();

  // Strip markdown code fences if present
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed) || parsed.length < 1) {
    throw new Error('Expected non-empty array of suggestions');
  }

  // Take first 3
  return parsed.slice(0, 3).map((s: SuggestionRaw) => ({
    type: validateType(s.type),
    title: String(s.title || ''),
    preview: String(s.preview || ''),
  }));
}

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const { transcript, previousTitles, systemPrompt, apiKey } = await request.json() as {
      transcript: string;
      previousTitles: string[];
      systemPrompt: string;
      apiKey: string;
    };

    if (!apiKey) {
      return Response.json({ error: 'API key is required', code: 'API_KEY_MISSING' }, { status: 400 });
    }

    if (!transcript || transcript.trim().length < 10) {
      return Response.json({ error: 'Transcript too short', code: 'TRANSCRIPT_TOO_SHORT' }, { status: 400 });
    }

    console.log('[suggestions] transcript context length:', transcript.length, 'chars');
    console.log('[suggestions] previous titles count:', previousTitles?.length || 0);

    // Build user message
    let userMessage = `## Live Transcript (most recent at bottom)\n${transcript}`;

    if (previousTitles && previousTitles.length > 0) {
      userMessage += `\n\n## Previously Generated Suggestions (do NOT repeat these)\n`;
      userMessage += previousTitles.map((t) => `- "${t}"`).join('\n');
    }

    userMessage += `\n\nGenerate 3 new suggestions based on the current conversation.`;

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_completion_tokens: 1024,
      }),
    });

    if (!groqResponse.ok) {
      const errBody = await groqResponse.json().catch(() => ({}));
      const errMessage = (errBody as { error?: { message?: string } })?.error?.message || 'Suggestion generation failed';
      console.error('[suggestions] Groq error:', groqResponse.status, errMessage);

      return Response.json(
        {
          error: errMessage,
          code: groqResponse.status === 401 ? 'INVALID_API_KEY' : groqResponse.status === 429 ? 'RATE_LIMITED' : 'GROQ_ERROR',
          retryAfter: groqResponse.headers.get('retry-after') ? parseInt(groqResponse.headers.get('retry-after')!) : undefined,
        },
        { status: groqResponse.status }
      );
    }

    const result = await groqResponse.json() as {
      choices: { message: { content: string } }[];
    };
    const rawText = result.choices?.[0]?.message?.content || '';
    console.log('[suggestions] raw model response:', rawText.slice(0, 500));

    const suggestions = parseSuggestions(rawText);
    const latency = Date.now() - startTime;
    console.log('[suggestions] parsed suggestions:', suggestions.map((s) => s.type + ': ' + s.title));
    console.log('[suggestions] latency:', latency, 'ms');

    return Response.json({ suggestions, latency });
  } catch (err) {
    console.error('[suggestions] error:', err);
    const message = err instanceof SyntaxError
      ? 'Failed to parse suggestions from model response'
      : 'Internal server error';
    return Response.json(
      { error: message, code: 'PARSE_ERROR' },
      { status: 500 }
    );
  }
}
