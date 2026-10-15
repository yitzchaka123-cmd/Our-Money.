/**
 * The household's numbers as compact text for the assistant. Built from the
 * same `DashboardData` the dashboard renders, so the assistant and the screen
 * never disagree. Pure: the loader (load.ts) does the reading.
 */

import type { DashboardData, EnvelopeView } from '@/lib/dashboard/data';
import type { EnvelopeType } from '@/lib/types';

/** A month with this many transactions or more is listed largest-first, cut here. */
export const MAX_TRANSACTIONS_PER_MONTH = 250;

const TYPE_LABEL: Record<EnvelopeType, string> = {
  variableIncome: 'הכנסה',
  cashIncome: 'הכנסה במזומן',
  fixedIncome: 'הכנסה קבועה',
  variable: 'הוצאות משתנות',
  fixed: 'הוצאה קבועה',
  trackingCategory: 'קטגוריה במעקב',
  riseupGoal: 'חיסכון',
};

const INCOME = new Set<EnvelopeType>(['variableIncome', 'fixedIncome', 'cashIncome']);

export interface MonthTransaction {
  date: string;
  name: string;
  amount: number;
  envelope: string;
  category: string | null;
  income: boolean;
  cash: boolean;
  who: string | null;
}

export interface MonthSnapshot {
  month: string;
  forecast: number;
  expectedIncome: number;
  actualIncome: number;
  expectedExpenses: number;
  actualExpenses: number;
  variableRemaining: number;
  envelopes: { type: EnvelopeType; title: string; actual: number; expected: number; pending: number }[];
  /** Spending per category label (cash included), largest first. */
  categories: { label: string; total: number; count: number }[];
  transactions: MonthTransaction[];
  /** How many were left out when the month had more than the cap. */
  omitted: number;
}

export interface CashSnapshot {
  total: number;
  wallets: { name: string; balance: number; isDefault: boolean; member: string | null }[];
  month: string;
  withdrawn: number;
  income: number;
  spent: number;
}

export function monthSnapshot(data: DashboardData): MonthSnapshot {
  const envelopes = data.envelopes.map((e) => ({
    type: e.type,
    title: e.title,
    actual: round(e.actual),
    expected: round(e.expected),
    pending: round(e.pendingTotal),
  }));
  const income = data.envelopes.filter((e) => INCOME.has(e.type));

  const all = data.envelopes.flatMap((e) => transactionsOf(e));
  const sorted = [...all].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const kept =
    sorted.length > MAX_TRANSACTIONS_PER_MONTH
      ? [...sorted].sort((a, b) => b.amount - a.amount).slice(0, MAX_TRANSACTIONS_PER_MONTH)
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      : sorted;

  const byCategory = new Map<string, { total: number; count: number }>();
  for (const t of all) {
    if (t.income) continue;
    const label = t.category || t.envelope;
    const entry = byCategory.get(label) ?? { total: 0, count: 0 };
    entry.total += t.amount;
    entry.count += 1;
    byCategory.set(label, entry);
  }

  return {
    month: data.month,
    forecast: round(data.forecast),
    expectedIncome: round(sum(income.map((e) => e.expected))),
    actualIncome: round(sum(income.map((e) => e.actual))),
    expectedExpenses: round(data.totalExpectedExpenses),
    actualExpenses: round(data.totalActualExpenses),
    variableRemaining: round(data.variableRemaining),
    envelopes,
    categories: [...byCategory.entries()]
      .map(([label, v]) => ({ label, total: round(v.total), count: v.count }))
      .sort((a, b) => b.total - a.total),
    transactions: kept,
    omitted: all.length - kept.length,
  };
}

function transactionsOf(envelope: EnvelopeView): MonthTransaction[] {
  return envelope.actuals.map((a) => ({
    date: a.transactionDate ?? a.billingDate ?? '',
    name: oneLine(a.businessName),
    amount: round(a.amountIls),
    envelope: envelope.title,
    category: a.categoryLabel ? oneLine(a.categoryLabel) : null,
    income: a.isIncome || INCOME.has(envelope.type),
    cash: Boolean(a.cash),
    who: a.cash?.memberName ?? null,
  }));
}

export function cashSnapshot(data: DashboardData): CashSnapshot {
  return {
    total: round(data.wallet.balance),
    wallets: data.wallet.wallets.map((w) => ({
      name: w.name,
      balance: round(w.balance),
      isDefault: w.isDefault,
      member: w.memberName,
    })),
    month: data.month,
    withdrawn: round(data.wallet.withdrawn),
    income: round(data.wallet.income),
    spent: round(data.wallet.spent),
  };
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export function formatMonth(snapshot: MonthSnapshot, heading: string): string {
  const lines = [
    `## ${heading} (${snapshot.month})`,
    `תחזית סוף החודש (הכנסות צפויות פחות הוצאות צפויות): ${ils(snapshot.forecast)}`,
    `הכנסות: נכנס ${ils(snapshot.actualIncome)} מתוך ${ils(snapshot.expectedIncome)} צפוי`,
    `הוצאות: יצא ${ils(snapshot.actualExpenses)} מתוך ${ils(snapshot.expectedExpenses)} צפוי`,
    `נשאר להוציא בהוצאות המשתנות: ${ils(snapshot.variableRemaining)}`,
    '',
    'מעטפות (סוג | שם | בפועל | צפוי | מזומן צפוי שעוד לא שולם):',
    ...snapshot.envelopes.map(
      (e) =>
        `- ${TYPE_LABEL[e.type] ?? e.type} | ${e.title} | ${ils(e.actual)} | ${ils(e.expected)}${e.pending ? ` | ${ils(e.pending)}` : ''}`,
    ),
    '',
    'הוצאות לפי קטגוריה (סה"כ, מספר חיובים):',
    ...(snapshot.categories.length
      ? snapshot.categories.map((c) => `- ${c.label}: ${ils(c.total)} (${c.count})`)
      : ['- אין הוצאות']),
    '',
    `תנועות (תאריך | שם | סכום | מעטפה | קטגוריה | אמצעי)${snapshot.omitted ? ` — ${snapshot.omitted} תנועות קטנות לא מופיעות כאן, אבל כלולות בסכומים למעלה` : ''}:`,
    ...(snapshot.transactions.length
      ? snapshot.transactions.map(
          (t) =>
            `- ${t.date} | ${t.name} | ${t.income ? '+' : ''}${ils(t.amount)} | ${t.envelope} | ${t.category ?? '-'} | ${t.cash ? `מזומן${t.who ? ` (${t.who})` : ''}` : 'כרטיס/בנק'}`,
        )
      : ['- אין תנועות']),
  ];
  return lines.join('\n');
}

export function formatCash(cash: CashSnapshot): string {
  return [
    '## מזומן',
    `סה"כ מזומן עכשיו בכל הארנקים: ${ils(cash.total)}`,
    'ארנקים:',
    ...cash.wallets.map(
      (w) => `- ${w.name}: ${ils(w.balance)}${w.isDefault ? ' (ברירת מחדל)' : ''}${w.member ? ` (של ${w.member})` : ''}`,
    ),
    `בחודש ${cash.month}: נמשך מהבנק ${ils(cash.withdrawn)}, הכנסות במזומן ${ils(cash.income)}, הוצאות במזומן ${ils(cash.spent)}`,
  ].join('\n');
}

export interface ContextInput {
  today: string;
  current: MonthSnapshot;
  previous: MonthSnapshot | null;
  cash: CashSnapshot;
  /** Months with data, newest first, for the get_month tool. */
  availableMonths: string[];
  lastSyncAt: string | null;
}

/** Everything the assistant knows up front, as one text block. */
export function buildContext(input: ContextInput): string {
  return [
    `היום: ${input.today}. סנכרון אחרון מ-RiseUp: ${input.lastSyncAt ?? 'עוד לא היה'}.`,
    `חודשים עם נתונים: ${input.availableMonths.join(', ') || 'אין'}. לחודש אחר — get_month.`,
    '',
    formatMonth(input.current, 'החודש הנוכחי'),
    '',
    input.previous ? formatMonth(input.previous, 'החודש הקודם') : '## החודש הקודם\nאין נתונים.',
    '',
    formatCash(input.cash),
  ].join('\n');
}

// ---------------------------------------------------------------------------

/** Whole shekels read best in an answer; agorot only when there are some. */
export function ils(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const text = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
  }).format(rounded);
  return `${text} ₪`;
}

/** Transaction names are data: one line, no markup that could pass for structure. */
function oneLine(text: string): string {
  return text.replace(/[\r\n|#]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
