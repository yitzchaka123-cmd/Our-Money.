import { transcribeWithOpenai } from '@/lib/stt/openai';

export interface AudioClip {
  data: ArrayBuffer;
  /** Telegram voice notes are OGG/Opus; audio files may be mp3/m4a. */
  filename: string;
  mimeType: string;
}

export interface TranscriptionResult {
  text: string;
}

/**
 * Speech-to-text lives behind this one function so the provider is a single
 * swap. Claude handles every other piece of language understanding in this
 * app; it is here only because the Messages API does not accept audio.
 */
export async function transcribe(clip: AudioClip): Promise<TranscriptionResult> {
  return transcribeWithOpenai(clip);
}
