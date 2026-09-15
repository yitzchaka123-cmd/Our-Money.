import type { CashSpend, CashTopup } from '@/lib/types';

export interface WalletState {
  toppedUp: number;
  logged: number;
  /** Cash that left the bank but was never logged. The number this app exists for. */
  unaccounted: number;
  topupCount: number;
  spendCount: number;
}

/**
 * Wallet arithmetic, kept pure so the interesting part is testable without a
 * database. Everything is rounded to agorot at the boundary.
 */
export function walletState(topups: CashTopup[], spends: CashSpend[]): WalletState {
  const live = topups.filter((t) => !t.is_dismissed);
  const counted = spends.filter((s) => s.status !== 'deleted');

  const toppedUp = round(live.reduce((sum, t) => sum + Number(t.amount_ils), 0));
  const logged = round(counted.reduce((sum, s) => sum + Number(s.amount_ils), 0));

  return {
    toppedUp,
    logged,
    unaccounted: round(toppedUp - logged),
    topupCount: live.length,
    spendCount: counted.length,
  };
}

export interface CategoryTotal {
  category: string;
  total: number;
  count: number;
}

export function totalsByCategory(spends: CashSpend[]): CategoryTotal[] {
  const totals = new Map<string, { total: number; count: number }>();

  for (const spend of spends) {
    if (spend.status === 'deleted') continue;
    const current = totals.get(spend.category) ?? { total: 0, count: 0 };
    current.total += Number(spend.amount_ils);
    current.count += 1;
    totals.set(spend.category, current);
  }

  return [...totals.entries()]
    .map(([category, { total, count }]) => ({ category, total: round(total), count }))
    .sort((a, b) => b.total - a.total);
}

export function totalsByMember(spends: CashSpend[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const spend of spends) {
    if (spend.status === 'deleted') continue;
    totals.set(spend.member_id, round((totals.get(spend.member_id) ?? 0) + Number(spend.amount_ils)));
  }
  return totals;
}

/** First and last day of a YYYY-MM month, as ISO dates. */
export function monthBounds(month: string): { from: string; to: string } {
  const [yearPart, monthPart] = month.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart);
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
