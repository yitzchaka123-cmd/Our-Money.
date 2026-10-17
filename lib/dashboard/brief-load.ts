import {
  buildBrief,
  EMPTY_BRIEF,
  type BriefData,
  type BriefEnvelope,
  type HistoryTxn,
  type RiseupRow,
} from '@/lib/dashboard/brief';
import { loadAccountLabels } from '@/lib/dashboard/account-labels';
import { accountNamer, type AccountRef } from '@/lib/dashboard/accounts';
import { assembleMonth, type ActualRow, type EnvelopeRow } from '@/lib/dashboard/data';
import { db } from '@/lib/db/client';
import { memberNameMap } from '@/lib/profile/names';
import { monthBounds } from '@/lib/reconcile';
import type { CashSpend, CashTopup, CashWallet } from '@/lib/types';

/** A member who has never finished a brief starts with the last day's news. */
export const FIRST_BRIEF_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** How far back the merchant rules look. */
const HISTORY_DAYS = 240;
/** PostgREST hands back at most this many rows per request. */
const PAGE = 1000;

const RISEUP_COLUMNS =
  'transaction_id, transaction_date, cashflow_month, business_name, amount_ils, is_income, account_nickname, account_number_hash, category_label, is_withdrawal, first_seen_at, source, source_type';

type Page<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Every row, a page at a time. */
export async function fetchAll<T>(page: Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

/** Where this member's brief starts: the last point they read to. */
export async function briefSeenUntil(memberId: string, now: Date): Promise<string> {
  const result = await db().from('member_brief_state').select('seen_until').eq('member_id', memberId).maybeSingle();
  const row = must(result, 'brief state') as { seen_until: string } | null;
  return row?.seen_until ?? new Date(now.getTime() - FIRST_BRIEF_LOOKBACK_MS).toISOString();
}

/**
 * The daily brief for one member: everything that reached us after they last
 * finished it, plus cash still waiting for review. A failure here must never
 * take the dashboard down, so the page calls `loadBriefSafely`.
 */
export async function loadBrief(memberId: string, now = new Date()): Promise<BriefData> {
  const supabase = db();
  const asOf = now.toISOString();
  const seenUntil = await briefSeenUntil(memberId, now);
  const historyFrom = new Date(now.getTime() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);

  const [newRiseup, newSpends, reviewSpends, newTopups, walletRows, memberRows, history] = await Promise.all([
    supabase.from('riseup_transactions').select(RISEUP_COLUMNS).gt('first_seen_at', seenUntil).then((r) => must(r, 'new charges')),
    supabase.from('cash_spends').select('*').neq('status', 'deleted').gt('created_at', seenUntil).then((r) => must(r, 'new cash')),
    supabase.from('cash_spends').select('*').eq('status', 'needs_review').then((r) => must(r, 'cash to review')),
    supabase
      .from('cash_topups')
      .select('*')
      .eq('is_dismissed', false)
      .in('source', ['cash_income', 'manual'])
      .gt('created_at', seenUntil)
      .then((r) => must(r, 'new cash income')),
    supabase.from('cash_wallets').select('*').then((r) => must(r, 'wallets')),
    supabase.from('household_members').select('id, display_name, preferred_name').then((r) => must(r, 'members')),
    fetchAll<{ transaction_id: string; transaction_date: string | null; business_name: string | null; amount_ils: number | string | null; is_income: boolean | null }>(
      (from, to) =>
        supabase
          .from('riseup_transactions')
          .select('transaction_id, transaction_date, business_name, amount_ils, is_income')
          .eq('is_withdrawal', false)
          .gte('transaction_date', historyFrom)
          .order('transaction_id')
          .range(from, to),
    ),
  ]);

  const riseupRows = (newRiseup ?? []) as RiseupRow[];
  const spends = dedupe([...((newSpends ?? []) as CashSpend[]), ...((reviewSpends ?? []) as CashSpend[])]);
  // The name each member chose, as on the dashboard — never the Telegram one when they chose.
  const memberNames = memberNameMap((memberRows ?? []) as { id: string; display_name: string; preferred_name: string | null }[]);

  const withdrawalIds = riseupRows.filter((r) => r.is_withdrawal).map((r) => r.transaction_id);
  const withdrawalTopups = withdrawalIds.length
    ? (must(await supabase.from('cash_topups').select('*').in('riseup_transaction_id', withdrawalIds), 'withdrawals') as CashTopup[])
    : [];

  const months = new Set<string>([
    ...riseupRows.filter((r) => !r.is_withdrawal).map((r) => r.cashflow_month ?? r.transaction_date?.slice(0, 7) ?? ''),
    ...spends.map((s) => s.spent_at.slice(0, 7)),
  ]);
  months.delete('');

  const envelopesByMonth: Record<string, BriefEnvelope[]> = {};
  const [labels] = await Promise.all([
    loadAccountLabels(),
    Promise.all(
      [...months].map(async (month) => {
        envelopesByMonth[month] = await monthEnvelopes(month, memberNames);
      }),
    ),
  ]);

  // A card reads as on the dashboard: numbered among the accounts in view.
  const refs: AccountRef[] = [
    ...Object.values(envelopesByMonth).flatMap((envelopes) =>
      envelopes.flatMap((e) => e.actuals.map((a) => ({ source: a.source, hash: a.accountNumberHash, nickname: a.accountNickname }))),
    ),
    ...riseupRows.map((r) => ({ source: r.source ?? null, hash: r.account_number_hash, nickname: r.account_nickname, sourceType: r.source_type ?? null })),
  ];

  return buildBrief({
    asOf,
    seenUntil,
    newRiseup: riseupRows,
    history: history.map((h): HistoryTxn => ({
      id: h.transaction_id,
      date: h.transaction_date,
      business: h.business_name ?? '',
      amount: Math.abs(Number(h.amount_ils ?? 0)),
      isIncome: Boolean(h.is_income),
    })),
    envelopesByMonth,
    cashSpends: spends,
    cashTopups: (newTopups ?? []) as CashTopup[],
    withdrawalTopups,
    wallets: ((walletRows ?? []) as CashWallet[]).map((w) => ({ id: w.id, name: w.name, isDefault: w.is_default })),
    memberNames,
    nameAccount: accountNamer(refs, labels),
  });
}

/**
 * Whether this member wants the daily brief at all (Settings → "הסיכום היומי").
 * On by default, and on while the setting's column does not exist yet.
 */
export async function briefEnabled(memberId: string): Promise<boolean> {
  const { data, error } = await db().from('household_members').select('*').eq('id', memberId).maybeSingle();
  if (error) {
    console.error('Reading the brief setting failed:', error.message);
    return true;
  }
  return (data as { show_daily_brief?: boolean | null } | null)?.show_daily_brief !== false;
}

export async function loadBriefSafely(memberId: string): Promise<BriefData> {
  try {
    return await loadBrief(memberId);
  } catch (error) {
    console.error('Daily brief failed to load', error);
    return EMPTY_BRIEF;
  }
}

/** A month's envelopes with cash filed in, exactly as the dashboard files it. */
async function monthEnvelopes(month: string, memberNames: Map<string, string>): Promise<BriefEnvelope[]> {
  const supabase = db();
  const { from, to } = monthBounds(month);
  const [envelopeRows, actualRows, spends, accountLabels] = await Promise.all([
    supabase.from('riseup_envelopes').select('*').eq('month', month).then((r) => must(r, 'envelopes')),
    supabase.from('riseup_envelope_actuals').select('*').eq('month', month).then((r) => must(r, 'envelope actuals')),
    supabase
      .from('cash_spends')
      .select('*')
      .neq('status', 'deleted')
      .gte('spent_at', from)
      .lte('spent_at', to)
      .then((r) => must(r, 'month cash')),
    // The couple's names for their cards, so a card reads as on the dashboard.
    loadAccountLabels(),
  ]);

  const { envelopes, riseupEnvelopes } = assembleMonth({
    month,
    envelopeRows: (envelopeRows ?? []) as EnvelopeRow[],
    actualRows: (actualRows ?? []) as ActualRow[],
    spends: (spends ?? []) as CashSpend[],
    topups: [],
    plans: [],
    skippedPlanIds: new Set(),
    memberNames,
    accountLabels,
  });
  const planned = new Map(riseupEnvelopes.map((e) => [e.envelopeId, e.plannedIls]));

  return envelopes.map((e) => ({
    envelopeId: e.envelopeId ?? e.key,
    type: e.type,
    title: e.title,
    planned: (e.envelopeId && planned.get(e.envelopeId)) || 0,
    actuals: e.actuals,
    ...(e.awaiting ? { awaiting: e.awaiting } : {}),
  }));
}

function dedupe(spends: CashSpend[]): CashSpend[] {
  return [...new Map(spends.map((s) => [s.id, s])).values()];
}
