import { env } from '@/lib/env';
import type { AudioClip, TranscriptionResult } from '@/lib/stt';

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';

/**
 * Transcribe via OpenAI's audio endpoint. Raw fetch rather than the OpenAI SDK:
 * this is the only OpenAI call in the codebase, and a multipart POST is less
 * code than the dependency would be.
 */
export async function transcribeWithOpenai(clip: AudioClip): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append('file', new Blob([clip.data], { type: clip.mimeType }), clip.filename);
  form.append('model', env.sttModel);
  // Auto-detect by default; a language hint materially improves Hebrew accuracy
  // but hurts when the speaker switches to English mid-sentence.
  if (env.sttLanguage) form.append('language', env.sttLanguage);

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.openaiApiKey}` },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Transcription failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as { text?: string };
  const text = (payload.text ?? '').trim();
  if (!text) throw new Error('Transcription returned empty text.');

  return { text };
}
