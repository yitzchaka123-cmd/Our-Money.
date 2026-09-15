import { NextResponse } from 'next/server';

import { env } from '@/lib/env';
import { handleUpdate } from '@/lib/telegram/handlers';
import type { TelegramUpdate } from '@/lib/telegram/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Transcription plus an AI parse is usually 3-6s; 60 leaves headroom for a
// cold start without Telegram giving up on us.
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  if (!secret || secret !== env.telegramWebhookSecret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  try {
    await handleUpdate(update);
  } catch (error) {
    // Deliberately a 200: Telegram retries non-2xx for hours, and a bug that
    // throws on one message would replay it forever. The failure is logged,
    // and handleUpdate already reports user-facing errors in the chat.
    console.error('Failed to handle update', update.update_id, error);
  }

  return NextResponse.json({ ok: true });
}
