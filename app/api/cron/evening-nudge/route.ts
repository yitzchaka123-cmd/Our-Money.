import { NextResponse } from 'next/server';

import { duePlans } from '@/lib/cash/plan-store';
import { isoDateInIsrael } from '@/lib/dates';
import { db } from '@/lib/db/client';
import { env } from '@/lib/env';
import { sendMessage } from '@/lib/telegram/client';
import { memberName } from '@/lib/profile/names';
import { familyGroupChatId } from '@/lib/telegram/group';
import { composeNudge, type NudgeMember } from '@/lib/telegram/nudge';
import { nudgeFrequencyOf, wantsNudgeOn } from '@/lib/telegram/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The evening "anything in cash today?" message, plus a one-tap "paid" for
 * each expected cash payment whose day has come. Scheduled by Vercel Cron;
 * EVENING_NUDGE=off turns it off without a redeploy of the schedule.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!env.eveningNudgeEnabled) return NextResponse.json({ ok: true, skipped: 'disabled' });

  const today = isoDateInIsrael();
  const supabase = db();
  const [members, spends, topups, review, due] = await Promise.all([
    supabase.from('household_members').select('*').eq('is_active', true),
    supabase.from('cash_spends').select('member_id').eq('spent_at', today).neq('status', 'deleted'),
    supabase.from('cash_topups').select('member_id').eq('occurred_at', today).eq('is_dismissed', false),
    supabase.from('cash_spends').select('id', { count: 'exact', head: true }).eq('status', 'needs_review'),
    duePlans(today),
  ]);

  const logged = new Set(
    [...(spends.data ?? []), ...(topups.data ?? [])]
      .map((row) => row.member_id as string | null)
      .filter((id): id is string => Boolean(id)),
  );

  type MemberRow = {
    id: string;
    display_name: string;
    preferred_name?: string | null;
    telegram_user_id: number | string;
    nudge_frequency?: string | null;
  };
  const memberRows = (members.data ?? []) as MemberRow[];
  // Each member's own choice in Settings → טלגרם (daily until they pick).
  const remindToday = new Set(
    memberRows.filter((m) => wantsNudgeOn(nudgeFrequencyOf(m), today)).map((m) => m.id),
  );

  const messages = composeNudge({
    remindToday,
    members: memberRows.map(
      (m): NudgeMember => ({
        id: m.id,
        // The name they chose, never the Telegram account's.
        displayName: memberName(m),
        telegramUserId: Number(m.telegram_user_id),
      }),
    ),
    loggedToday: logged,
    due,
    reviewCount: review.count ?? 0,
    groupChatId: await familyGroupChatId(),
  });

  let sent = 0;
  for (const message of messages) {
    try {
      await sendMessage(message.chatId, message.text, message.keyboard);
      sent += 1;
    } catch (error) {
      // A member who never opened a private chat with the bot cannot be
      // messaged; that should not stop everyone else's nudge.
      console.error('Nudge not delivered', error);
    }
  }

  return NextResponse.json({ ok: true, messages: messages.length, sent });
}
