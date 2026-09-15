import { NextResponse } from 'next/server';

import { env } from '@/lib/env';
import { formatIls, friendlyDate } from '@/lib/telegram/format';
import { escapeHtml, sendMessage } from '@/lib/telegram/client';
import { isoDateInIsrael } from '@/lib/intake/parse';
import { syncRiseup } from '@/lib/riseup/sync';

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

  const result = await syncRiseup();
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
    const today = isoDateInIsrael();
    await sendMessage(
      groupChatId,
      [
        '🏧 <b>זוהו משיכות מזומן חדשות</b>',
        '',
        ...result.newTopups.map(
          (topup) =>
            `• ${formatIls(Number(topup.amount_ils))} · ${escapeHtml(
              topup.business_name ?? 'משיכה',
            )} · ${friendlyDate(topup.occurred_at, today)}`,
        ),
        '',
        'הוספתי אותן לארנק. /balance כדי לראות את המצב.',
      ].join('\n'),
    );
  }

  return NextResponse.json({
    ok: !result.error,
    months: result.months,
    transactions: result.transactionsUpserted,
    newTopups: result.newTopups.length,
    error: result.error,
  });
}
