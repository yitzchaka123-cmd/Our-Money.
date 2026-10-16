import type { CashTopup } from '@/lib/types';

/**
 * RiseUp's "איזו הכנסה זו?", for cash income: its kind and its category.
 *
 * - variable (משתנה): counted this month only — the default.
 * - fixed (קבועה): expected again next month. It becomes a monthly expected
 *   income (a cash plan), so next month it shows as "צפוי להיכנס" until it
 *   arrives.
 * - non_cashflow (לא תזרימית): the cash is in the wallet, but it is not
 *   income — a debt paid back, money moved between accounts — so it stays
 *   out of the cashflow and the forecast.
 */

export type IncomeKind = 'variable' | 'fixed' | 'non_cashflow';

export const INCOME_KINDS: { value: IncomeKind; label: string; hint: string }[] = [
  { value: 'variable', label: 'משתנה', hint: 'נספרת בתזרים של החודש הזה בלבד.' },
  { value: 'fixed', label: 'קבועה', hint: 'מעכשיו נצפה להכנסה דומה גם בחודשים הבאים — בערך באותו סכום ובאותו זמן בחודש. עד שתגיע היא תופיע כצפויה להיכנס.' },
  { value: 'non_cashflow', label: 'לא תזרימית', hint: 'הכסף נכנס לארנק, אבל לא נספר בתזרים ובצפי — למשל החזר חוב או כסף שעבר מחשבון אחר.' },
];

/** RiseUp's own income types; "אחר" lets you name your own. */
export const DEFAULT_INCOME_CATEGORIES = ['משכורת', 'דיור', 'קצבאות'];
export const OTHER_CATEGORY = 'אחר';

export function isIncomeKind(value: unknown): value is IncomeKind {
  return value === 'variable' || value === 'fixed' || value === 'non_cashflow';
}

/**
 * What a stored row is: its kind if set; an income settling a monthly plan
 * (recorded before kinds existed) is fixed; anything else variable.
 */
export function incomeKindOf(topup: Pick<CashTopup, 'income_kind' | 'plan_id'>): IncomeKind {
  if (isIncomeKind(topup.income_kind)) return topup.income_kind;
  return topup.plan_id ? 'fixed' : 'variable';
}

/** Whether a cash income counts in the month's cashflow and forecast. */
export function countsInCashflow(topup: Pick<CashTopup, 'income_kind'>): boolean {
  return topup.income_kind !== 'non_cashflow';
}

/**
 * The category chips: RiseUp's three, then every name the couple gave a cash
 * income before (most recent first, so "remembered for next time"), then
 * "אחר" to type a new one.
 */
export function incomeCategoryChoices(topups: CashTopup[]): string[] {
  const own = topups
    .filter((t) => t.source === 'cash_income' && !t.is_dismissed && t.category?.trim())
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0))
    .map((t) => t.category!.trim())
    .filter((c) => !DEFAULT_INCOME_CATEGORIES.includes(c) && c !== OTHER_CATEGORY);
  return [...DEFAULT_INCOME_CATEGORIES, ...new Set(own)];
}
