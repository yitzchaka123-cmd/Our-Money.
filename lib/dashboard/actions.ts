'use server';

import { sessionMember } from '@/lib/auth/member';
import type { CashPlan } from '@/lib/cash/plans';
import {
  assembleMonth,
  spendToActual,
  toPlans,
  type ActualRow,
  type EnvelopeRow,
} from '@/lib/dashboard/data';
import {
  amountOf,
  cleanQuery,
  FIRST_PAGE,
  mergePage,
  SEARCH_PAGE,
  validCursor,
  type SearchCursor,
} from '@/lib/dashboard/search';
import { ENVELOPE_TITLES, type NormalizedActual } from '@/lib/riseup/envelopes';
import { db } from '@/lib/db/client';
import { toOverrides, type TrackerOverrideRow } from '@/lib/dashboard/trackers';
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
  /**
   * The month had no such tracker, so `actual` is the month's spending with
   * the tracker's category label, read off RiseUp's transactions.
   */
  fromTransactions?: boolean;
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
  /** A tracker's month-to-month key (see lib/dashboard/trackers.ts). */
  key: string | null = null,
  /** A tracker's category label, for months that had no such tracker. */
  label: string | null = null,
): Promise<Loaded<HistoryPoint[]>> {
  if (!(await sessionMember())) return { ok: false, error: EXPIRED };
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: 'חודש לא תקין.' };

  const months = monthsEnding(month, count);
  const from = monthBounds(months[0]!).from;
  const to = monthBounds(months[months.length - 1]!).to;
  const supabase = db();

  const [envelopes, actuals, spends, topups, plans, skips, members, overrides, transactions] = await Promise.all([
    supabase.from('riseup_envelopes').select('*').in('month', months),
    supabase.from('riseup_envelope_actuals').select('*').in('month', months),
    supabase.from('cash_spends').select('*').neq('status', 'deleted').gte('spent_at', from).lte('spent_at', to),
    supabase.from('cash_topups').select('*').eq('is_dismissed', false).gte('occurred_at', from).lte('occurred_at', to),
    supabase.from('cash_plans').select('*').eq('is_active', true),
    supabase.from('cash_plan_skips').select('plan_id, month').in('month', months),
    supabase.from('household_members').select('id, display_name'),
    // Errors (no migration 0006 yet) just mean no overrides.
    supabase.from('tracker_overrides').select('*').in('month', ['', ...months]),
    type === 'trackingCategory' && label
      ? supabase
          .from('riseup_transactions')
          .select('cashflow_month, amount_ils')
          .in('cashflow_month', months)
          .eq('category_label', label)
          .eq('is_income', false)
      : Promise.resolve({ data: [], error: null }),
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
  const overrideList = toOverrides(overrides.data as TrackerOverrideRow[] | null);
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
      overrides: overrideList,
    });

    const match =
      type === 'trackingCategory'
        ? (key ? views.find((v) => v.type === type && v.trackerKey === key) : undefined) ??
          views.find((v) => v.type === type && v.title.trim() === title.trim())
        : views.find((v) => v.type === type);

    if (!match && type === 'trackingCategory' && label) {
      const fromTransactions = ((transactions.data ?? []) as { cashflow_month: string; amount_ils: number | string }[])
        .filter((t) => t.cashflow_month === m)
        .reduce((s, t) => s + Math.abs(Number(t.amount_ils) || 0), 0);
      return { month: m, actual: round(fromTransactions), expected: 0, cash: 0, present: fromTransactions > 0, fromTransactions: true };
    }

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
// Search — "חיפוש בתזרים"
// ---------------------------------------------------------------------------

export interface SearchHit {
  key: string;
  source: 'cash' | 'card';
  kind: 'spend' | 'income' | 'withdrawal';
  /** The row id: RiseUp's transaction id, or our cash row's id. */
  id: string;
  date: string;
  /** The cashflow month the row belongs to, for the month headers. */
  month: string;
  amountIls: number;
  title: string;
  category: string | null;
  note: string | null;
  memberId: string | null;
  walletId: string | null;
  fromBank: boolean;
  detail: string | null;
  /** What the transaction sheet needs to open this row. */
  actual: NormalizedActual;
  envelopeType: EnvelopeType;
  envelopeTitle: string;
  envelopeId: string | null;
}

export interface SearchResults {
  hits: SearchHit[];
  /** Where "טען תוצאות ישנות יותר" continues; null when nothing is left. */
  next: SearchCursor | null;
}

/**
 * Every RiseUp charge and every cash entry, across all months, matching a
 * business name, note, category or amount — newest first, a page at a time.
 */
export async function searchTransactions(
  query: string,
  cursor: SearchCursor | null = null,
): Promise<Loaded<SearchResults>> {
  if (!(await sessionMember())) return { ok: false, error: EXPIRED };
  const at = cursor ?? FIRST_PAGE;
  if (!validCursor(at)) return { ok: false, error: 'החיפוש נכשל. נסו שוב.' };
  const q = cleanQuery(typeof query === 'string' ? query : '');
  if (!q) return { ok: true, data: { hits: [], next: null } };

  const amount = amountOf(q);
  const supabase = db();
  const take = SEARCH_PAGE + 1;
  const match = (columns: string[]) =>
    [...columns.map((c) => `${c}.ilike.%${q}%`), ...(amount !== null ? [`amount_ils.eq.${amount}`] : [])].join(',');

  const [card, spends, topups, members] = await Promise.all([
    supabase
      .from('riseup_envelope_actuals')
      .select('*')
      .or(match(['business_name', 'category_label']))
      .order('transaction_date', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .range(at.card, at.card + take - 1),
    supabase
      .from('cash_spends')
      .select('*')
      .neq('status', 'deleted')
      .or(match(['note', 'category']))
      .order('spent_at', { ascending: false })
      .order('id', { ascending: false })
      .range(at.spend, at.spend + take - 1),
    supabase
      .from('cash_topups')
      .select('*')
      .eq('is_dismissed', false)
      .or(match(['note', 'category', 'business_name']))
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .range(at.topup, at.topup + take - 1),
    supabase.from('household_members').select('id, display_name'),
  ]);
  const failed = [card, spends, topups].find((r) => r.error);
  if (failed?.error) {
    console.error('Search failed:', failed.error.message);
    return { ok: false, error: 'החיפוש נכשל. נסו שוב.' };
  }

  const memberNames = new Map(
    ((members.data ?? []) as { id: string; display_name: string }[]).map((m) => [m.id, m.display_name]),
  );
  const cardRows = (card.data ?? []) as (ActualRow & { month: string })[];

  // The envelope each charge sits in, for the sheet's colour and label.
  const envelopeIds = [...new Set(cardRows.map((r) => r.envelope_id))];
  const { data: envelopeRows } = envelopeIds.length
    ? await supabase.from('riseup_envelopes').select('month, envelope_id, envelope_type, name').in('envelope_id', envelopeIds)
    : { data: [] };
  const envelopeOf = new Map(
    ((envelopeRows ?? []) as { month: string; envelope_id: string; envelope_type: string; name: string | null }[]).map((e) => [
      `${e.month}|${e.envelope_id}`,
      e,
    ]),
  );

  const titleFor = (type: EnvelopeType, name: string | null) => name ?? ENVELOPE_TITLES[type] ?? '';

  const cardHits = cardRows.map((row): SearchHit => {
    const envelope = envelopeOf.get(`${row.month}|${row.envelope_id}`);
    const type = (envelope?.envelope_type ?? 'variable') as EnvelopeType;
    const date = row.transaction_date ?? `${row.month}-01`;
    const actual: NormalizedActual = {
      transactionId: row.transaction_id,
      transactionDate: row.transaction_date,
      billingDate: row.billing_date,
      businessName: row.business_name ?? '',
      amountIls: Number(row.amount_ils),
      isIncome: row.is_income,
      accountNickname: row.account_nickname,
      accountNumberHash: row.account_number_hash,
      source: row.source,
      isInstallment: row.is_installment,
      paymentNumber: row.payment_number,
      totalPayments: row.total_payments,
      categoryLabel: row.category_label,
    };
    return {
      key: `card:${row.month}:${row.envelope_id}:${row.transaction_id}`,
      source: 'card',
      kind: row.is_income ? 'income' : 'spend',
      id: row.transaction_id,
      date,
      month: row.month,
      amountIls: actual.amountIls,
      title: actual.businessName || 'עסקה',
      category: row.category_label,
      note: null,
      memberId: null,
      walletId: null,
      fromBank: false,
      detail: row.account_nickname ?? row.account_number_hash ?? null,
      actual,
      envelopeType: type,
      envelopeTitle: titleFor(type, envelope?.name ?? null),
      envelopeId: row.envelope_id,
    };
  });

  const spendHits = ((spends.data ?? []) as CashSpend[]).map((s): SearchHit => {
    const type = (s.envelope_type ?? 'variable') as EnvelopeType;
    const actual = spendToActual(s, memberNames);
    return {
      key: `spend:${s.id}`,
      source: 'cash',
      kind: 'spend',
      id: s.id,
      date: s.spent_at,
      month: s.spent_at.slice(0, 7),
      amountIls: Number(s.amount_ils),
      title: s.note || s.category,
      category: s.category,
      note: s.note,
      memberId: s.member_id,
      walletId: s.wallet_id,
      fromBank: false,
      detail: s.category,
      actual,
      envelopeType: type,
      envelopeTitle: type === 'trackingCategory' ? s.category : titleFor(type, null),
      envelopeId: s.envelope_id,
    };
  });

  const topupHits = ((topups.data ?? []) as CashTopup[]).map((t): SearchHit => {
    const kind = t.source === 'cash_income' ? 'income' : 'withdrawal';
    const title = t.note || (kind === 'income' ? t.category || 'הכנסה במזומן' : t.business_name || 'משיכת מזומן');
    return {
      key: `topup:${t.id}`,
      source: 'cash',
      kind,
      id: t.id,
      date: t.occurred_at,
      month: t.occurred_at.slice(0, 7),
      amountIls: Number(t.amount_ils),
      title,
      category: t.category,
      note: t.note,
      memberId: t.member_id,
      walletId: t.wallet_id,
      fromBank: t.source === 'riseup_withdrawal' || t.riseup_transaction_id !== null,
      detail: kind === 'withdrawal' ? 'משיכה' : t.category,
      actual: {
        transactionId: `cash-income:${t.id}`,
        transactionDate: t.occurred_at,
        billingDate: t.occurred_at,
        businessName: title,
        amountIls: Number(t.amount_ils),
        isIncome: true,
        accountNickname: 'מזומן',
        accountNumberHash: null,
        source: 'cash',
        isInstallment: false,
        paymentNumber: null,
        totalPayments: null,
        categoryLabel: t.category,
        cash: {
          id: t.id,
          kind: 'income',
          memberName: t.member_id ? (memberNames.get(t.member_id) ?? null) : null,
          inputKind: t.input_kind ?? 'text',
          status: 'confirmed',
          walletId: t.wallet_id,
        },
      },
      envelopeType: 'cashIncome',
      envelopeTitle: titleFor('cashIncome', null),
      envelopeId: null,
    };
  });

  const page = mergePage({ card: cardHits, spend: spendHits, topup: topupHits }, at);
  return { ok: true, data: { hits: page.items, next: page.next } };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
