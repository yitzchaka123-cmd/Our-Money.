import { countsAsSpent } from '@/lib/reconcile';
import type { CashSpend, CashTopup } from '@/lib/types';

/**
 * How much cash comes into the wallets each month — RiseUp's "צפוי להיכנס",
 * for cash. "In" is ATM withdrawals and cash income; money put into a wallet
 * by hand and balance updates are not income and stay out.
 */

export interface CashMonthFlow {
  month: string;
  in: number;
  out: number;
}

export interface InflowForecast {
  month: string;
  /** The average of `basis` months' cash in, in whole shekels. */
  predicted: number;
  /** The months the average is taken over, oldest first (at most three). */
  basis: string[];
  /** The couple's own figure for this month, if they set one. */
  override: number | null;
  /** What the card shows: our figure if set, else the guess. */
  expected: number;
  /** Cash in so far this month. */
  arrived: number;
}

const IN_SOURCES = new Set<CashTopup['source']>(['riseup_withdrawal', 'manual', 'cash_income']);

/** The `n` months before `month`, oldest first. */
export function previousMonths(month: string, n: number): string[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const out: string[] = [];
  for (let back = n; back >= 1; back -= 1) {
    const d = new Date(Date.UTC(year!, monthNumber! - 1 - back, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function isCashIn(t: CashTopup): boolean {
  return !t.is_dismissed && IN_SOURCES.has(t.source);
}

/** Cash in and out for each of `months`, in that order. */
export function cashFlowsByMonth(topups: CashTopup[], spends: CashSpend[], months: string[]): CashMonthFlow[] {
  return months.map((month) => ({
    month,
    in: round(topups.filter((t) => isCashIn(t) && t.occurred_at.startsWith(month)).reduce((s, t) => s + Number(t.amount_ils), 0)),
    out: round(
      spends
        .filter((s) => countsAsSpent(s) && s.spent_at.startsWith(month))
        .reduce((s, x) => s + Number(x.amount_ils), 0),
    ),
  }));
}

/**
 * This month's expected cash in: the average of the last three months — only
 * months since cash was first recorded, so a new app does not average in
 * months before anyone used it — unless the couple set their own figure.
 */
export function inflowForecast(
  topups: CashTopup[],
  spends: CashSpend[],
  month: string,
  override: number | null,
): InflowForecast {
  const first = firstCashMonth(topups, spends);
  const basis = previousMonths(month, 3).filter((m) => first !== null && m >= first);
  const flows = cashFlowsByMonth(topups, spends, basis);
  const predicted = basis.length > 0 ? Math.round(flows.reduce((s, f) => s + f.in, 0) / basis.length) : 0;
  const arrived = cashFlowsByMonth(topups, [], [month])[0]!.in;
  return { month, predicted, basis, override, expected: override ?? predicted, arrived };
}

function firstCashMonth(topups: CashTopup[], spends: CashSpend[]): string | null {
  const dates = [
    ...topups.filter(isCashIn).map((t) => t.occurred_at),
    ...spends.filter((s) => s.status !== 'deleted').map((s) => s.spent_at),
  ].sort();
  return dates[0]?.slice(0, 7) ?? null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
