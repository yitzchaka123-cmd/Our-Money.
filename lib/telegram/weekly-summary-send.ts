import { loadDashboard } from '@/lib/dashboard/data';
import { isoDateInIsrael } from '@/lib/dates';
import { db } from '@/lib/db/client';
import { env } from '@/lib/env';
import { memberName } from '@/lib/profile/names';
import { botFeatureOn } from '@/lib/telegram/bot-features-load';
import { sendMessage } from '@/lib/telegram/client';
import { familyGroupChatId } from '@/lib/telegram/group';
import { composeWeeklySummary, summaryWeek } from '@/lib/telegram/weekly-summary';

/**
 * Send the Sunday summary (C24): once per week, to the family group if there
 * is one, otherwise to each member privately. The week is claimed in
 * money.app_settings before anything is sent, so a retried or doubled cron
 * never sends it twice; if nobody could be reached the claim is given back.
 */

const SENT_KEY = 'weekly_summary_week';

export type WeeklySummaryOutcome =
  | { sent: number; week: string }
  | { sent: 0; skipped: 'off' | 'already_sent' | 'nobody'; week?: string };

type Claim = { claimed: true; previous: string | null } | { claimed: false };

async function claimWeek(week: string): Promise<Claim> {
  const settings = () => db().from('app_settings');
  const { data: row, error } = await settings().select('value').eq('key', SENT_KEY).maybeSingle();
  if (error) throw new Error(`Could not read the last weekly summary: ${error.message}`);

  if (!row) {
    const { data: inserted, error: insertError } = await settings()
      .upsert({ key: SENT_KEY, value: week, updated_at: new Date().toISOString() }, { onConflict: 'key', ignoreDuplicates: true })
      .select('key');
    if (insertError) throw new Error(`Could not claim the weekly summary: ${insertError.message}`);
    return (inserted ?? []).length > 0 ? { claimed: true, previous: null } : { claimed: false };
  }

  const previous = (row.value as string | null) ?? '';
  if (previous >= week) return { claimed: false };
  // Compare-and-set: of two runs racing, only one moves it.
  let update = settings().update({ value: week, updated_at: new Date().toISOString() }).eq('key', SENT_KEY);
  update = previous ? update.eq('value', previous) : update.is('value', null);
  const { data: changed, error: updateError } = await update.select('key');
  if (updateError) throw new Error(`Could not claim the weekly summary: ${updateError.message}`);
  return (changed ?? []).length > 0 ? { claimed: true, previous: previous || null } : { claimed: false };
}

async function releaseWeek(week: string, previous: string | null): Promise<void> {
  const settings = db().from('app_settings');
  const { error } = previous
    ? await settings.update({ value: previous }).eq('key', SENT_KEY).eq('value', week)
    : await settings.delete().eq('key', SENT_KEY).eq('value', week);
  if (error) console.error('Could not release the weekly summary week', error.message);
}

function monthBefore(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year!, m! - 2, 1)).toISOString().slice(0, 7);
}

export async function sendWeeklySummary(now = new Date()): Promise<WeeklySummaryOutcome> {
  if (!(await botFeatureOn('weekly_summary'))) return { sent: 0, skipped: 'off' };

  const today = isoDateInIsrael(now);
  const week = summaryWeek(today);
  const claim = await claimWeek(week.key);
  if (!claim.claimed) return { sent: 0, skipped: 'already_sent', week: week.key };

  let delivered = 0;
  try {
    const month = today.slice(0, 7);
    const [{ data: members }, group, data, previous] = await Promise.all([
      db().from('household_members').select('*').eq('is_active', true).order('created_at'),
      familyGroupChatId(),
      loadDashboard(month),
      week.from.slice(0, 7) < month ? loadDashboard(monthBefore(month)) : Promise.resolve(null),
    ]);
    type Row = { display_name: string; preferred_name?: string | null; telegram_user_id: number | string };
    const people = ((members ?? []) as Row[]).map((m) => ({ name: memberName(m), chatId: Number(m.telegram_user_id) }));

    const compose = (names: string[]) =>
      composeWeeklySummary({
        today,
        month,
        week,
        envelopes: data.envelopes,
        previousEnvelopes: previous?.envelopes ?? [],
        walletBalance: data.wallet.balance,
        forecast: data.forecast,
        names,
        dashboardUrl: `${env.appBaseUrl}/dashboard`,
      });

    const messages =
      group !== null
        ? [{ chatId: group, text: compose(people.map((p) => p.name)) }]
        : people.filter((p) => p.chatId > 0).map((p) => ({ chatId: p.chatId, text: compose([p.name]) }));

    for (const message of messages) {
      try {
        await sendMessage(message.chatId, message.text);
        delivered += 1;
      } catch (error) {
        // A member who never opened a private chat with the bot cannot be messaged.
        console.error('Weekly summary not delivered', error);
      }
    }
  } finally {
    if (delivered === 0) await releaseWeek(week.key, claim.previous);
  }

  return delivered > 0 ? { sent: delivered, week: week.key } : { sent: 0, skipped: 'nobody', week: week.key };
}
