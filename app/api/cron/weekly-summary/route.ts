import { NextResponse } from 'next/server';

import { env } from '@/lib/env';
import { sendWeeklySummary } from '@/lib/telegram/weekly-summary-send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The Sunday-morning summary in Telegram (C24). Scheduled by Vercel Cron;
 * Settings → טלגרם → "סיכום שבועי בטלגרם" turns it off, and it is sent at
 * most once per week however often this runs.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const outcome = await sendWeeklySummary();
  return NextResponse.json({ ok: true, ...outcome });
}
