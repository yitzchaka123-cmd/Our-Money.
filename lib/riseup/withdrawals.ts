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
