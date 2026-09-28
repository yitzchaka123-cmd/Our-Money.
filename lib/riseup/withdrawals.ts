import type { RiseupTransaction } from '@/lib/types';

/**
 * Merchant strings that mean "cash left the account".
 *
 * These are the shapes Israeli banks commonly use, but every bank words it
 * slightly differently — after the first sync, check /topups against the real
 * data and add whatever your bank actually writes.
 */
export const WITHDRAWAL_PATTERNS: RegExp[] = [
  /משיכת\s*מזומן/,
  /משיכת\s*מזומנים/,
  /משיכת\s*שטרות/,
  /כספומט/,
  /בנקט/,
  /משיכה\s*במכשיר/,
  /\bATM\b/i,
  /cash\s*withdrawal/i,
];

/** Account types that can dispense cash. A credit card line is never a withdrawal here. */
const CASH_SOURCE_TYPES = new Set(['checkingaccount', 'bankaccount']);

/** Name-only test, for envelope actuals which carry no sourceType. */
export function matchesWithdrawalName(businessName: string | null | undefined): boolean {
  const name = businessName ?? '';
  return WITHDRAWAL_PATTERNS.some((pattern) => pattern.test(name));
}

export function isWithdrawal(transaction: RiseupTransaction): boolean {
  if (transaction.isIncome) return false;

  // sourceType is absent on some older transactions; treat unknown as eligible
  // rather than silently dropping a real withdrawal.
  const sourceType = transaction.sourceType?.toLowerCase();
  if (sourceType && !CASH_SOURCE_TYPES.has(sourceType)) return false;

  return matchesWithdrawalName(transaction.businessName);
}

/** RiseUp returns ISO datetimes at UTC midnight; we store plain dates. */
export function toDateOnly(isoDatetime: string | undefined): string | null {
  if (!isoDatetime) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(isoDatetime);
  return match?.[1] ?? null;
}

/** A withdrawal somebody typed in by hand before RiseUp saw it. */
export interface ManualWithdrawalCandidate {
  id: string;
  amount_ils: number;
  occurred_at: string;
}

/** Bank dates drift a day or two from when the cash was actually taken. */
export const WITHDRAWAL_MATCH_WINDOW_DAYS = 3;

function daysApart(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
  return ms / (24 * 60 * 60 * 1000);
}

/**
 * Pair each bank withdrawal with a hand-entered one of the same amount taken
 * within a few days, so the same cash is never counted twice. Each manual row
 * links to at most one bank row, and the closest date wins.
 */
export function matchManualWithdrawals(
  detected: RiseupTransaction[],
  manual: ManualWithdrawalCandidate[],
): { links: Array<{ transaction: RiseupTransaction; manualId: string }>; unmatched: RiseupTransaction[] } {
  const available = [...manual];
  const links: Array<{ transaction: RiseupTransaction; manualId: string }> = [];
  const unmatched: RiseupTransaction[] = [];

  // Oldest first, so an earlier withdrawal claims the earlier manual entry.
  const ordered = [...detected].sort((a, b) =>
    (a.transactionDate ?? '').localeCompare(b.transactionDate ?? ''),
  );

  for (const transaction of ordered) {
    const date = toDateOnly(transaction.transactionDate);
    let best = -1;
    let bestGap = Infinity;
    available.forEach((candidate, index) => {
      if (!date) return;
      if (Math.abs(Number(candidate.amount_ils) - Math.abs(transaction.amount)) > 0.005) return;
      const gap = daysApart(candidate.occurred_at, date);
      if (gap <= WITHDRAWAL_MATCH_WINDOW_DAYS && gap < bestGap) {
        best = index;
        bestGap = gap;
      }
    });

    if (best >= 0) {
      links.push({ transaction, manualId: available[best]!.id });
      available.splice(best, 1);
    } else {
      unmatched.push(transaction);
    }
  }

  return { links, unmatched };
}
