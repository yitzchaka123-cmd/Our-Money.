import { loadAccountLabels } from '@/lib/dashboard/account-labels';
import { accountNamer, type AccountRef } from '@/lib/dashboard/accounts';
import { normalizeBusiness } from '@/lib/dashboard/brief';
import { NOTE_MAX, quotedIdList } from '@/lib/dashboard/notes';
import { isoDateInIsrael } from '@/lib/dates';
import { db } from '@/lib/db/client';
import { formatIls } from '@/lib/money';
import { matchesWithdrawalName } from '@/lib/riseup/withdrawals';
import { botFeatureOn } from '@/lib/telegram/bot-features-load';
import { escapeHtml, sendForceReply, sendMessage } from '@/lib/telegram/client';
import { familyGroupChatId } from '@/lib/telegram/group';
import type { TelegramMessage } from '@/lib/telegram/types';
import type { HouseholdMember } from '@/lib/types';

/**
 * "מה קניתם כאן?" (C26). After each sync, a RiseUp card or bank charge at a
 * business that never appeared before gets one question in Telegram — in the
 * family group if there is one, otherwise to each member. The answer, a reply
 * to that question, becomes our own note on the charge (money.transaction_notes,
 * the same note the dashboard edits). RiseUp itself is never changed.
 *
 * Each charge is asked about once: money.business_questions (migration 0013)
 * is claimed before sending. Settings → טלגרם → "לשאול על עסק חדש" turns it off.
 */

/** Charges that reached us this recently are new; older ones are never asked about. */
const ASK_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
export const MAX_QUESTIONS_PER_SYNC = 5;
const PLACEHOLDER = 'למשל: שניצל';

export interface ChargeRow {
  transaction_id: string;
  transaction_date: string | null;
  first_seen_at: string;
  cashflow_month: string | null;
  business_name: string | null;
  amount_ils: number | string | null;
  is_income: boolean | null;
  is_withdrawal: boolean;
  source: string | null;
  account_number_hash: string | null;
  account_nickname: string | null;
}

const CHARGE_COLUMNS =
  'transaction_id, transaction_date, first_seen_at, cashflow_month, business_name, amount_ils, is_income, is_withdrawal, source, account_number_hash, account_nickname';

function isAskable(row: ChargeRow): boolean {
  return (
    !row.is_income &&
    !row.is_withdrawal &&
    !matchesWithdrawalName(row.business_name) &&
    Number(row.amount_ils) > 0 &&
    Boolean(row.business_name?.trim())
  );
}

function earlier(a: ChargeRow, b: ChargeRow): number {
  const da = a.transaction_date ?? '9999';
  const dbb = b.transaction_date ?? '9999';
  if (da !== dbb) return da < dbb ? -1 : 1;
  if (a.first_seen_at !== b.first_seen_at) return a.first_seen_at < b.first_seen_at ? -1 : 1;
  return a.transaction_id < b.transaction_id ? -1 : 1;
}

/**
 * The charges to ask about: among recent ones, the first charge at each
 * business no older row knows — unless that charge was already asked about
 * or already has a note, which settles the business. Oldest first, at most five.
 */
export function pickNewBusinessCharges({
  recent,
  knownBusinesses,
  skip,
  limit = MAX_QUESTIONS_PER_SYNC,
}: {
  recent: ChargeRow[];
  /** Normalized names of businesses that appeared before the recent window. */
  knownBusinesses: ReadonlySet<string>;
  /** Charges already asked about, or with a note. */
  skip: ReadonlySet<string>;
  limit?: number;
}): ChargeRow[] {
  const firstByBusiness = new Map<string, ChargeRow>();
  // Every recent row counts as "seen", even ones never asked about (income at the same name, say).
  for (const row of [...recent].sort(earlier)) {
    const key = normalizeBusiness(row.business_name ?? '');
    if (!key || firstByBusiness.has(key)) continue;
    firstByBusiness.set(key, row);
  }
  return [...firstByBusiness.entries()]
    .filter(([key, row]) => !knownBusinesses.has(key) && isAskable(row) && !skip.has(row.transaction_id))
    .map(([, row]) => row)
    .slice(0, limit);
}

function shortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${Number(day)}.${Number(month)}`;
}

export function businessQuestionText(charge: ChargeRow, accountName: string | null): string {
  const where = [charge.transaction_date ? shortDate(charge.transaction_date) : null, accountName?.trim() || null]
    .filter(Boolean)
    .map((part) => escapeHtml(part!))
    .join(', ');
  return (
    `🛍 חיוב חדש: <b>${formatIls(Number(charge.amount_ils))}</b> ב-${escapeHtml(charge.business_name!.trim())}` +
    `${where ? ` (${where})` : ''}. מה קניתם? אפשר לענות בהודעה (או ״דלג״).`
  );
}

/** "דלג" (or a lone dash) answers the question without a note. */
export function isSkipAnswer(text: string): boolean {
  const word = text.trim().replace(/[.!׳']+$/u, '').trim();
  return word === 'דלג' || word === '-' || word === 'skip';
}

function messageKey(chatId: number, messageId: number): string {
  return `${chatId}:${messageId}`;
}

/** Ask about every new business since the last sync. Returns how many were asked. */
export async function askAboutNewBusinesses(now = new Date()): Promise<number> {
  if (!(await botFeatureOn('ask_new_business'))) return 0;
  const supabase = db();
  const since = new Date(now.getTime() - ASK_WINDOW_MS).toISOString();

  const { data: recentRows, error } = await supabase
    .from('riseup_transactions')
    .select(CHARGE_COLUMNS)
    .gte('first_seen_at', since)
    .limit(1000);
  if (error || !recentRows || recentRows.length === 0) return 0;
  const recent = recentRows as ChargeRow[];

  // A business is known when any row of it reached us before the window.
  const names = [...new Set(recent.filter(isAskable).map((r) => r.business_name!))];
  const known = new Set<string>();
  await Promise.all(
    names.map(async (name) => {
      const { count } = await supabase
        .from('riseup_transactions')
        .select('transaction_id', { count: 'exact', head: true })
        .eq('business_name', name)
        .lt('first_seen_at', since);
      if ((count ?? 0) > 0) known.add(normalizeBusiness(name));
    }),
  );

  // Only each new business's first charge can be asked about; look those up.
  const firsts = pickNewBusinessCharges({ recent, knownBusinesses: known, skip: new Set(), limit: Infinity });
  if (firsts.length === 0) return 0;
  const ids = firsts.map((r) => r.transaction_id);
  const [{ data: asked, error: askedError }, { data: noted }] = await Promise.all([
    supabase.from('business_questions').select('transaction_id').filter('transaction_id', 'in', quotedIdList(ids)),
    supabase.from('transaction_notes').select('transaction_id').filter('transaction_id', 'in', quotedIdList(ids)),
  ]);
  // Before migration 0013 the table is missing: ask nothing rather than ask twice.
  if (askedError) return 0;
  const skip = new Set([...(asked ?? []), ...(noted ?? [])].map((r) => r.transaction_id as string));

  const charges = pickNewBusinessCharges({ recent, knownBusinesses: known, skip });
  if (charges.length === 0) return 0;

  const [group, { data: members }, labels] = await Promise.all([
    familyGroupChatId(),
    supabase.from('household_members').select('telegram_user_id').eq('is_active', true),
    loadAccountLabels(),
  ]);
  const targets = group !== null ? [group] : (members ?? []).map((m) => Number(m.telegram_user_id)).filter((id) => id > 0);
  if (targets.length === 0) return 0;

  const refOf = (c: ChargeRow): AccountRef => ({ source: c.source, hash: c.account_number_hash, nickname: c.account_nickname });
  const nameAccount = accountNamer(recent.map(refOf), labels);

  let count = 0;
  for (const charge of charges) {
    // Claim it first: whoever inserts the row is the one who asks.
    const { data: claimed } = await supabase
      .from('business_questions')
      .upsert(
        { transaction_id: charge.transaction_id, business_name: charge.business_name!.trim().slice(0, 200), asked_at: now.toISOString() },
        { onConflict: 'transaction_id', ignoreDuplicates: true },
      )
      .select('transaction_id');
    if (!claimed || claimed.length === 0) continue;

    const text = businessQuestionText(charge, nameAccount(refOf(charge)));
    const messages: string[] = [];
    for (const chatId of targets) {
      try {
        const sent = await sendForceReply(chatId, text, PLACEHOLDER);
        messages.push(messageKey(sent.chat?.id ?? chatId, sent.message_id));
      } catch (sendError) {
        // A member who never opened a chat with the bot cannot be messaged.
        console.error('New-business question not delivered', sendError);
      }
    }
    if (messages.length === 0) {
      // Nobody heard it: let the next sync try again while the charge is recent.
      await supabase.from('business_questions').delete().eq('transaction_id', charge.transaction_id).eq('status', 'asking');
      continue;
    }
    await supabase.from('business_questions').update({ status: 'asked', messages }).eq('transaction_id', charge.transaction_id);
    count += 1;
  }
  return count;
}

interface QuestionRow {
  transaction_id: string;
  business_name: string | null;
  status: string;
}

/**
 * A household member replied to a "מה קניתם?" question: keep the answer as
 * the charge's note and say so. Returns false when the message is not an
 * answer to one, so the bot handles it as usual.
 */
export async function answerBusinessQuestion(message: TelegramMessage, member: HouseholdMember): Promise<boolean> {
  const question = message.reply_to_message;
  if (!question?.from?.is_bot) return false;
  const text = (message.text ?? '').trim();
  // A photo or a voice note in reply is not a note; the usual flow takes it.
  if (!text || text.startsWith('/')) return false;

  const supabase = db();
  const { data, error } = await supabase
    .from('business_questions')
    .select('transaction_id, business_name, status')
    .contains('messages', [messageKey(message.chat.id, question.message_id)])
    .limit(1);
  if (error || !data || data.length === 0) return false;
  const asked = data[0] as QuestionRow;
  const business = escapeHtml(asked.business_name ?? '');


  const done = { answered_by: member.id, answered_at: new Date().toISOString() };
  if (isSkipAnswer(text)) {
    await supabase.from('business_questions').update({ status: 'skipped', ...done }).eq('transaction_id', asked.transaction_id);
    await sendMessage(message.chat.id, `בסדר, דילגנו על ${business} ⏭`);
    return true;
  }

  const { data: charge } = await supabase
    .from('riseup_transactions')
    .select('cashflow_month, transaction_date')
    .eq('transaction_id', asked.transaction_id)
    .maybeSingle();
  const month = [charge?.cashflow_month, (charge?.transaction_date as string | null)?.slice(0, 7), isoDateInIsrael().slice(0, 7)].find(
    (m): m is string => typeof m === 'string' && /^\d{4}-\d{2}$/.test(m),
  )!;
  const note = text.slice(0, NOTE_MAX);

  const { error: noteError } = await supabase
    .from('transaction_notes')
    .upsert(
      { transaction_id: asked.transaction_id, month, note, updated_by: member.id, updated_at: new Date().toISOString() },
      { onConflict: 'transaction_id' },
    );
  if (noteError) {
    console.error('Saving the answer as a note failed:', noteError.message);
    await sendMessage(message.chat.id, 'משהו השתבש בשמירה. אפשר לנסות שוב, או להוסיף הערה בדאשבורד.');
    return true;
  }
  await supabase.from('business_questions').update({ status: 'answered', ...done }).eq('transaction_id', asked.transaction_id);
  await sendMessage(message.chat.id, `נשמר ✅ ${business}: ${escapeHtml(note)}`);
  return true;
}
