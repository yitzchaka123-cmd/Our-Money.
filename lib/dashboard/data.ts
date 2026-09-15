import { db } from '@/lib/db/client';
import { isoDateInIsrael } from '@/lib/intake/parse';
import { monthBounds, walletState, type WalletState } from '@/lib/reconcile';
import type { CashSpend, CashTopup } from '@/lib/types';

export interface CategoryRow {
  label: string;
  /** Card and bank spending from RiseUp, with ATM withdrawals excluded. */
  bank: number;
  /** Cash spending logged through the bot. */
  cash: number;
  total: number;
}

export interface RecentCashItem {
  id: string;
  amount: number;
  category: string;
  note: string | null;
  spentAt: string;
  memberName: string;
  inputKind: 'text' | 'voice';
  status: CashSpend['status'];
}

export interface DashboardData {
  month: string;
  availableMonths: string[];
  income: number;
  bankSpending: number;
  cashLogged: number;
  withdrawnThisMonth: number;
  /** Withdrawn this month but not yet logged. Never negative — see below. */
  unloggedThisMonth: number;
  totalSpending: number;
  /** The hero number: what is left of this month's income. */
  net: number;
  walletNow: WalletState;
  categories: CategoryRow[];
  recentCash: RecentCashItem[];
  lastSyncAt: string | null;
}

const UNLOGGED_LABEL = 'מזומן שטרם נרשם';

export function currentMonth(): string {
  return isoDateInIsrael().slice(0, 7);
}

export async function loadDashboard(month: string): Promise<DashboardData> {
  const supabase = db();
  const { from, to } = monthBounds(month);

  const [
    { data: transactions },
    { data: monthSpends },
    { data: monthTopups },
    { data: allSpends },
    { data: allTopups },
    { data: members },
    { data: syncRuns },
    { data: monthRows },
  ] = await Promise.all([
    supabase
      .from('riseup_transactions')
      .select('amount_ils, is_income, category_label, is_withdrawal')
      .eq('cashflow_month', month),
    supabase
      .from('cash_spends')
      .select('*')
      .neq('status', 'deleted')
      .gte('spent_at', from)
      .lte('spent_at', to)
      .order('spent_at', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('cash_topups')
      .select('*')
      .eq('is_dismissed', false)
      .gte('occurred_at', from)
      .lte('occurred_at', to),
    supabase.from('cash_spends').select('*').neq('status', 'deleted'),
    supabase.from('cash_topups').select('*').eq('is_dismissed', false),
    supabase.from('household_members').select('id, display_name'),
    supabase
      .from('sync_runs')
      .select('finished_at')
      .eq('status', 'succeeded')
      .order('finished_at', { ascending: false })
      .limit(1),
    supabase.from('riseup_transactions').select('cashflow_month'),
  ]);

  const memberNames = new Map(
    (members ?? []).map((m) => [m.id as string, m.display_name as string]),
  );

  const income = sum(
    (transactions ?? []).filter((t) => t.is_income).map((t) => Number(t.amount_ils)),
  );

  // Withdrawals are deliberately excluded: an ATM withdrawal is cash changing
  // location, not money spent. The spending it represents arrives instead as
  // logged cash entries, plus whatever is still unaccounted for.
  const bankTransactions = (transactions ?? []).filter(
    (t) => !t.is_income && !t.is_withdrawal,
  );
  const bankSpending = sum(bankTransactions.map((t) => Number(t.amount_ils)));

  const spends = (monthSpends ?? []) as CashSpend[];
  const cashLogged = sum(spends.map((s) => Number(s.amount_ils)));
  const withdrawnThisMonth = sum(
    ((monthTopups ?? []) as CashTopup[]).map((t) => Number(t.amount_ils)),
  );

  // Clamped at zero on purpose: cash withdrawn in an earlier month and spent in
  // this one makes the month-scoped difference negative, which is a quirk of
  // the window rather than money appearing from nowhere. The true running
  // figure is walletNow, which is all-time.
  const unloggedThisMonth = round(Math.max(0, withdrawnThisMonth - cashLogged));

  const categories = buildCategories(bankTransactions, spends, unloggedThisMonth);

  return {
    month,
    availableMonths: uniqueMonths(
      ((monthRows ?? []) as { cashflow_month: string | null }[])
        .map((r) => r.cashflow_month)
        .filter((m): m is string => Boolean(m)),
      month,
    ),
    income: round(income),
    bankSpending: round(bankSpending),
    cashLogged: round(cashLogged),
    withdrawnThisMonth: round(withdrawnThisMonth),
    unloggedThisMonth,
    totalSpending: round(bankSpending + cashLogged + unloggedThisMonth),
    net: round(income - bankSpending - cashLogged - unloggedThisMonth),
    walletNow: walletState(
      ((allTopups ?? []) as CashTopup[]),
      ((allSpends ?? []) as CashSpend[]),
    ),
    categories,
    recentCash: spends.slice(0, 12).map((spend) => ({
      id: spend.id,
      amount: Number(spend.amount_ils),
      category: spend.category,
      note: spend.note,
      spentAt: spend.spent_at,
      memberName: memberNames.get(spend.member_id) ?? '—',
      inputKind: spend.input_kind,
      status: spend.status,
    })),
    lastSyncAt: (syncRuns?.[0]?.finished_at as string | undefined) ?? null,
  };
}

interface BankRow {
  amount_ils: number | string;
  category_label: string | null;
}

function buildCategories(
  bankTransactions: BankRow[],
  spends: CashSpend[],
  unlogged: number,
): CategoryRow[] {
  const rows = new Map<string, CategoryRow>();

  const upsert = (label: string): CategoryRow => {
    const existing = rows.get(label);
    if (existing) return existing;
    const created: CategoryRow = { label, bank: 0, cash: 0, total: 0 };
    rows.set(label, created);
    return created;
  };

  for (const transaction of bankTransactions) {
    const row = upsert(transaction.category_label || 'אחר');
    row.bank += Number(transaction.amount_ils);
  }

  for (const spend of spends) {
    const row = upsert(spend.category);
    row.cash += Number(spend.amount_ils);
  }

  // Unaccounted cash gets its own row so the category totals still add up to
  // total spending — otherwise the dashboard would quietly under-report.
  if (unlogged > 0) {
    const row = upsert(UNLOGGED_LABEL);
    row.cash += unlogged;
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      bank: round(row.bank),
      cash: round(row.cash),
      total: round(row.bank + row.cash),
    }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function isUnloggedRow(label: string): boolean {
  return label === UNLOGGED_LABEL;
}

function uniqueMonths(months: string[], current: string): string[] {
  return [...new Set([...months, current])].sort().reverse().slice(0, 12);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
