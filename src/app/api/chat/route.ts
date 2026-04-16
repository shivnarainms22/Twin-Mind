export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { messages, systemPrompt, transcript, apiKey } = await request.json() as {
      messages: { role: string; content: string }[];
      systemPrompt: string;
      transcript: string;
      apiKey: string;
    };

    if (!apiKey) {
      return Response.json({ error: 'API key is required', code: 'API_KEY_MISSING' }, { status: 400 });
    }

    // Build system message with transcript context
    const systemContent = transcript
      ? `${systemPrompt}\n\n## MEETING TRANSCRIPT (what people are saying in the live conversation — this is your primary source of truth)\n${transcript}`
      : systemPrompt;

    console.log('[chat] sending message, transcript context:', transcript?.length || 0, 'chars, messages:', messages.length);

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: systemContent },
          ...messages,
        ],
        stream: true,
        temperature: 0.7,
        max_completion_tokens: 2048,
      }),
    });

    if (!groqResponse.ok) {
      const errBody = await groqResponse.json().catch(() => ({}));
      const errMessage = (errBody as { error?: { message?: string } })?.error?.message || 'Chat request failed';
      console.error('[chat] Groq error:', groqResponse.status, errMessage);

      return Response.json(
        {
          error: errMessage,
          code: groqResponse.status === 401 ? 'INVALID_API_KEY' : groqResponse.status === 429 ? 'RATE_LIMITED' : 'GROQ_ERROR',
        },
        { status: groqResponse.status }
      );
    }

    // Pipe the streaming response directly to the client
    return new Response(groqResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[chat] unexpected error:', err);
    return Response.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
