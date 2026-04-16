export const runtime = 'nodejs';

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const apiKey = formData.get('apiKey') as string | null;

    if (!apiKey) {
      return Response.json(
        { error: 'API key is required', code: 'API_KEY_MISSING' },
        { status: 400 }
      );
    }

    if (!audioFile) {
      return Response.json(
        { error: 'Audio file is required', code: 'AUDIO_MISSING' },
        { status: 400 }
      );
    }

    console.log('[transcribe] received blob, size:', audioFile.size, 'type:', audioFile.type, 'name:', audioFile.name);

    // Read the file into a buffer to ensure proper forwarding
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log('[transcribe] buffered audio, buffer size:', buffer.length);

    // Determine file extension from mime type
    const mimeType = audioFile.type || 'audio/webm';
    let ext = 'webm';
    if (mimeType.includes('mp4')) ext = 'mp4';
    else if (mimeType.includes('ogg')) ext = 'ogg';

    // Create fresh Blob from buffer for Groq
    const audioBlob = new Blob([buffer], { type: mimeType });

    const groqForm = new FormData();
    groqForm.append('file', audioBlob, `audio.${ext}`);
    groqForm.append('model', 'whisper-large-v3');
    groqForm.append('language', 'en');
    groqForm.append('response_format', 'verbose_json');

    console.log('[transcribe] sending to Groq Whisper...');

    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: groqForm,
    });

    console.log('[transcribe] Groq response status:', groqResponse.status);

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('[transcribe] Groq error:', groqResponse.status, errText);

      let errMessage = 'Transcription failed';
      try {
        const errBody = JSON.parse(errText);
        errMessage = errBody?.error?.message || errMessage;
      } catch {
        errMessage = errText || errMessage;
      }

      return Response.json(
        {
          error: errMessage,
          code: groqResponse.status === 401 ? 'INVALID_API_KEY' : groqResponse.status === 429 ? 'RATE_LIMITED' : 'GROQ_ERROR',
          retryAfter: groqResponse.headers.get('retry-after') ? parseInt(groqResponse.headers.get('retry-after')!) : undefined,
        },
        { status: groqResponse.status }
      );
    }

    const result = await groqResponse.json() as { text: string };
    const latency = Date.now() - startTime;
    console.log('[transcribe] success, text length:', result.text.length, 'latency:', latency, 'ms');

    return Response.json({ text: result.text, latency });
  } catch (err) {
    console.error('[transcribe] unexpected error:', err);
    return Response.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}`, code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
