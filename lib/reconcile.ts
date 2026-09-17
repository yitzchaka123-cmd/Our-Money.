import type { CashSpend, CashTopup, CashTransfer, CashWallet } from '@/lib/types';

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

export interface WalletBalance {
  walletId: string;
  balance: number;
  in: number;
  out: number;
}

/**
 * Per-wallet balances. A wallet holds what went into it (withdrawals, cash
 * income, transfers in) minus what left it (spends, transfers out). Rows
 * written before wallets existed have no wallet and count toward the default,
 * so the total across wallets always equals the single-wallet figure.
 */
export function walletBalances(
  wallets: CashWallet[],
  topups: CashTopup[],
  spends: CashSpend[],
  transfers: CashTransfer[],
): WalletBalance[] {
  const fallback = wallets.find((w) => w.is_default)?.id ?? wallets[0]?.id ?? null;
  const totals = new Map<string, { in: number; out: number }>(
    wallets.map((w) => [w.id, { in: 0, out: 0 }]),
  );
  const bucket = (id: string | null): { in: number; out: number } | undefined =>
    totals.get(id ?? fallback ?? '') ?? (fallback ? totals.get(fallback) : undefined);

  for (const t of topups) {
    if (t.is_dismissed) continue;
    const b = bucket(t.wallet_id);
    if (b) b.in += Number(t.amount_ils);
  }
  for (const s of spends) {
    if (s.status === 'deleted') continue;
    const b = bucket(s.wallet_id);
    if (b) b.out += Number(s.amount_ils);
  }
  for (const x of transfers) {
    if (x.is_dismissed) continue;
    const from = totals.get(x.from_wallet_id);
    const to = totals.get(x.to_wallet_id);
    if (from) from.out += Number(x.amount_ils);
    if (to) to.in += Number(x.amount_ils);
  }

  return wallets.map((w) => {
    const t = totals.get(w.id) ?? { in: 0, out: 0 };
    return {
      walletId: w.id,
      in: round(t.in),
      out: round(t.out),
      balance: round(t.in - t.out),
    };
  });
}
