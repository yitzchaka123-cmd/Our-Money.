'use server';

import { sessionMember } from '@/lib/auth/member';
import type { CashPlan } from '@/lib/cash/plans';
import {
  assembleMonth,
  toPlans,
  type ActualRow,
  type EnvelopeRow,
} from '@/lib/dashboard/data';
import { db } from '@/lib/db/client';
import { monthBounds } from '@/lib/reconcile';
import type { CashSpend, CashTopup, EnvelopeType } from '@/lib/types';

/**
 * Read-only queries the dashboard runs on demand: an envelope's previous
 * months, and search across RiseUp's charges and our cash.
 */

export interface HistoryPoint {
  month: string;
  actual: number;
  expected: number;
  /** Of `actual`, how much was cash. */
  cash: number;
  /** False when that month has no envelope with this identity. */
  present: boolean;
}

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

const EXPIRED = 'פג תוקף הכניסה. שלחו /dashboard לבוט בטלגרם כדי לקבל קישור חדש.';

/** `count` months ending at `month`, oldest first. */
function monthsEnding(month: string, count: number): string[] {
  const [year, monthNumber] = month.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year!, monthNumber! - 1 - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/**
 * "חודשים קודמים": the same envelope over the last months, built exactly as
 * the dashboard builds each month, so the numbers match what was on screen.
 * Envelope ids change monthly — the big envelopes are matched by type and a
 * tracker by its name.
 */
export async function envelopeHistory(
  month: string,
  type: EnvelopeType,
  title: string,
  count = 6,
): Promise<Loaded<HistoryPoint[]>> {
  if (!(await sessionMember())) return { ok: false, error: EXPIRED };
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: 'חודש לא תקין.' };

  const months = monthsEnding(month, count);
  const from = monthBounds(months[0]!).from;
  const to = monthBounds(months[months.length - 1]!).to;
  const supabase = db();

  const [envelopes, actuals, spends, topups, plans, skips, members] = await Promise.all([
    supabase.from('riseup_envelopes').select('*').in('month', months),
    supabase.from('riseup_envelope_actuals').select('*').in('month', months),
    supabase.from('cash_spends').select('*').neq('status', 'deleted').gte('spent_at', from).lte('spent_at', to),
    supabase.from('cash_topups').select('*').eq('is_dismissed', false).gte('occurred_at', from).lte('occurred_at', to),
    supabase.from('cash_plans').select('*').eq('is_active', true),
    supabase.from('cash_plan_skips').select('plan_id, month').in('month', months),
    supabase.from('household_members').select('id, display_name'),
  ]);
  const failed = [envelopes, actuals, spends, topups, plans, skips, members].find((r) => r.error);
  if (failed?.error) {
    console.error('History load failed:', failed.error.message);
    return { ok: false, error: 'לא הצלחנו לטעון את ההיסטוריה. נסו שוב.' };
  }

  const memberNames = new Map(
    ((members.data ?? []) as { id: string; display_name: string }[]).map((m) => [m.id, m.display_name]),
  );
  const planList = toPlans(plans.data as CashPlan[] | null);
  const inMonth = <T,>(rows: T[] | null, key: (row: T) => string, m: string) =>
    (rows ?? []).filter((row) => key(row).startsWith(m));

  const points = months.map((m): HistoryPoint => {
    const { envelopes: views } = assembleMonth({
      month: m,
      envelopeRows: inMonth(envelopes.data as (EnvelopeRow & { month: string })[] | null, (r) => r.month, m),
      actualRows: inMonth(actuals.data as (ActualRow & { month: string })[] | null, (r) => r.month, m),
      spends: inMonth(spends.data as CashSpend[] | null, (r) => r.spent_at, m),
      topups: inMonth(topups.data as CashTopup[] | null, (r) => r.occurred_at, m),
      plans: planList,
      skippedPlanIds: new Set(
        ((skips.data ?? []) as { plan_id: string; month: string }[]).filter((s) => s.month === m).map((s) => s.plan_id),
      ),
      memberNames,
    });

    const match =
      type === 'trackingCategory'
        ? views.find((v) => v.type === type && v.title.trim() === title.trim())
        : views.find((v) => v.type === type);

    return {
      month: m,
      actual: match?.actual ?? 0,
      expected: match?.expected ?? 0,
      cash: match ? round(match.actuals.filter((a) => a.cash).reduce((s, a) => s + a.amountIls, 0)) : 0,
      present: Boolean(match),
    };
  });

  return { ok: true, data: points };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchFilters {
  query: string;
  source: 'all' | 'cash' | 'card';
  /** Inclusive, YYYY-MM. */
  fromMonth: string;
  toMonth: string;
  /** Cash only. */
  walletId: string | null;
}

export interface SearchHit {
  key: string;
  source: 'cash' | 'card';
  kind: 'spend' | 'income' | 'withdrawal';
  /** For a cash hit: the row id, so the entry sheet can open it. */
  id: string;
  date: string;
  amountIls: number;
  title: string;
  category: string | null;
  note: string | null;
  memberId: string | null;
  walletId: string | null;
  fromBank: boolean;
  detail: string | null;
}

const MAX_HITS = 200;

/** Strip the characters PostgREST's filter grammar treats as syntax. */
function cleanQuery(query: string): string {
  return query.replace(/[,()%*\\]/g, ' ').trim().slice(0, 60);
}

export async function searchTransactions(filters: SearchFilters): Promise<Loaded<SearchHit[]>> {
  if (!(await sessionMember())) return { ok: false, error: EXPIRED };
  const month = /^\d{4}-\d{2}$/;
  if (!month.test(filters.fromMonth) || !month.test(filters.toMonth)) return { ok: false, error: 'חודשים לא תקינים.' };

  const q = cleanQuery(filters.query);
  const amount = /^\d+(\.\d+)?$/.test(q) ? Number(q) : null;
  const from = monthBounds(filters.fromMonth).from;
  const to = monthBounds(filters.toMonth).to;
  const supabase = db();
  const wantCard = filters.source !== 'cash' && !filters.walletId;
  const wantCash = filters.source !== 'card';

  const like = (columns: string[]) => columns.map((c) => `${c}.ilike.%${q}%`).join(',');

  const cardQuery = () => {
    let query = supabase
      .from('riseup_envelope_actuals')
      .select('transaction_id, transaction_date, business_name, amount_ils, is_income, category_label, account_nickname, account_number_hash, month')
      .gte('month', filters.fromMonth)
      .lte('month', filters.toMonth)
      .order('transaction_date', { ascending: false })
      .limit(MAX_HITS);
    if (amount !== null) query = query.eq('amount_ils', amount);
    else if (q) query = query.or(like(['business_name', 'category_label']));
    return query;
  };

  const spendQuery = () => {
    let query = supabase
      .from('cash_spends')
      .select('*')
      .neq('status', 'deleted')
      .gte('spent_at', from)
      .lte('spent_at', to)
      .order('spent_at', { ascending: false })
      .limit(MAX_HITS);
    if (filters.walletId) query = query.eq('wallet_id', filters.walletId);
    if (amount !== null) query = query.eq('amount_ils', amount);
    else if (q) query = query.or(like(['note', 'category']));
    return query;
  };

  const topupQuery = () => {
    let query = supabase
      .from('cash_topups')
      .select('*')
      .eq('is_dismissed', false)
      .gte('occurred_at', from)
      .lte('occurred_at', to)
      .order('occurred_at', { ascending: false })
      .limit(MAX_HITS);
    if (filters.walletId) query = query.eq('wallet_id', filters.walletId);
    if (amount !== null) query = query.eq('amount_ils', amount);
    else if (q) query = query.or(like(['note', 'category', 'business_name']));
    return query;
  };

  const [card, spends, topups] = await Promise.all([
    wantCard ? cardQuery() : Promise.resolve({ data: [], error: null }),
    wantCash ? spendQuery() : Promise.resolve({ data: [], error: null }),
    wantCash ? topupQuery() : Promise.resolve({ data: [], error: null }),
  ]);
  const failed = [card, spends, topups].find((r) => r.error);
  if (failed?.error) {
    console.error('Search failed:', failed.error.message);
    return { ok: false, error: 'החיפוש נכשל. נסו שוב.' };
  }

  const hits: SearchHit[] = [
    ...((card.data ?? []) as Record<string, unknown>[]).map((row): SearchHit => ({
      key: `card:${row.transaction_id as string}:${row.month as string}`,
      source: 'card',
      kind: row.is_income ? 'income' : 'spend',
      id: row.transaction_id as string,
      date: (row.transaction_date as string | null) ?? `${row.month as string}-01`,
      amountIls: Number(row.amount_ils),
      title: (row.business_name as string | null) || 'עסקה',
      category: (row.category_label as string | null) ?? null,
      note: null,
      memberId: null,
      walletId: null,
      fromBank: false,
      detail: (row.account_nickname as string | null) ?? (row.account_number_hash ? `כרטיס ${row.account_number_hash as string}` : null),
    })),
    ...((spends.data ?? []) as CashSpend[]).map((s): SearchHit => ({
      key: `spend:${s.id}`,
      source: 'cash',
      kind: 'spend',
      id: s.id,
      date: s.spent_at,
      amountIls: Number(s.amount_ils),
      title: s.note || s.category,
      category: s.category,
      note: s.note,
      memberId: s.member_id,
      walletId: s.wallet_id,
      fromBank: false,
      detail: s.category,
    })),
    ...((topups.data ?? []) as CashTopup[]).map((t): SearchHit => {
      const kind = t.source === 'cash_income' ? 'income' : 'withdrawal';
      return {
        key: `topup:${t.id}`,
        source: 'cash',
        kind,
        id: t.id,
        date: t.occurred_at,
        amountIls: Number(t.amount_ils),
        title: t.note || (kind === 'income' ? t.category || 'הכנסה במזומן' : t.business_name || 'משיכת מזומן'),
        category: t.category,
        note: t.note,
        memberId: t.member_id,
        walletId: t.wallet_id,
        fromBank: t.source === 'riseup_withdrawal' || t.riseup_transaction_id !== null,
        detail: kind === 'withdrawal' ? 'משיכה' : t.category,
      };
    }),
  ];

  hits.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { ok: true, data: hits.slice(0, MAX_HITS) };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
