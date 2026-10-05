import { NextResponse } from 'next/server';

import { env } from '@/lib/env';
import { ensureWebhook, escapeHtml, sendMessage } from '@/lib/telegram/client';
import { pruneOldData } from '@/lib/riseup/prune';
import { syncRiseup } from '@/lib/riseup/sync';
import { announceWithdrawals } from '@/lib/telegram/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Scheduled RiseUp pull. Vercel Cron sends the CRON_SECRET as a bearer token;
 * the same endpoint can be hit manually with the same header.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Keep the bot reachable: re-registers only if the URL or secret drifted.
  await ensureWebhook().catch((error) => console.error('Webhook check failed', error));

  const result = await syncRiseup();
  // Once a day is plenty, and this route runs once or twice a day.
  await pruneOldData().catch((error) => console.error('Prune failed', error));
  const groupChatId = env.telegramGroupChatId;

  // A dead PAT silently stops the wallet from being topped up, which would
  // quietly corrupt every balance. Always surface it.
  if (result.tokenExpired && groupChatId) {
    await sendMessage(
      groupChatId,
      [
        '🔑 <b>הטוקן של רייזאפ פג</b>',
        '',
        'הסנכרון מושהה עד שיוחלף. צרו טוקן חדש (budget:read) ב-',
        'https://input.riseup.co.il/developer/tokens',
        'ועדכנו את RISEUP_PAT.',
      ].join('\n'),
    );
  } else if (result.error && groupChatId) {
    await sendMessage(
      groupChatId,
      `⚠️ סנכרון רייזאפ נכשל:\n<code>${escapeHtml(result.error)}</code>`,
    );
  } else if (result.newTopups.length > 0 && groupChatId) {
    await announceWithdrawals(groupChatId, result.newTopups);
  }

  return NextResponse.json({
    ok: !result.error,
    months: result.months,
    transactions: result.transactionsUpserted,
    newTopups: result.newTopups.length,
    error: result.error,
  });
}
