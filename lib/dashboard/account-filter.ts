import { accountDisplayName } from '@/lib/dashboard/accounts';
import type { DashboardData, EnvelopeView } from '@/lib/dashboard/data';
import type { NormalizedActual } from '@/lib/riseup/envelopes';
import type { EnvelopeType } from '@/lib/types';

/**
 * RiseUp's "חשבונות להצגה": tick which cards and accounts the dashboard
 * shows. Purely a view — nothing is stored on the server and RiseUp is not
 * touched. Rows from an unticked account leave every breakdown and every
 * "spent so far" figure; plans and targets (the forecast) stay as they are.
 */

export const CASH_ACCOUNT = 'cash';

export interface AccountOption {
  key: string;
  label: string;
  cash: boolean;
}

/** One key per card or bank account, `${source}:${hash}`; all cash is one. */
export function accountKey(actual: NormalizedActual): string {
  if (actual.cash || actual.source === 'cash') return CASH_ACCOUNT;
  return `${actual.source ?? ''}:${actual.accountNumberHash ?? actual.accountNickname ?? ''}`;
}

/**
 * The account's name as the rest of the app shows it (lib/dashboard/accounts.ts):
 * the loader's friendly name — your name for it, RiseUp's nickname, or the
 * provider — never RiseUp's opaque code.
 */
export function accountLabel(actual: NormalizedActual): string {
  if (actual.cash || actual.source === 'cash') return 'מזומן';
  return (
    actual.accountName ??
    accountDisplayName({ source: actual.source, hash: actual.accountNumberHash, nickname: actual.accountNickname }, [])
  );
}

/** Every account seen in this month's rows, cards and banks first, then cash. */
export function listAccounts(envelopes: EnvelopeView[]): AccountOption[] {
  const found = new Map<string, AccountOption>();
  for (const envelope of envelopes) {
    for (const actual of envelope.actuals) {
      const key = accountKey(actual);
      if (key === CASH_ACCOUNT || found.has(key)) continue;
      found.set(key, { key, label: accountLabel(actual), cash: false });
    }
  }
  // In the order the dashboard first shows them, so the list reads top-down.
  return [...found.values(), { key: CASH_ACCOUNT, label: 'מזומן', cash: true }];
}

const EXPENSES = new Set<EnvelopeType>(['variable', 'fixed', 'trackingCategory', 'riseupGoal']);

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The dashboard as it reads with some accounts hidden. */
export function filterDashboard(data: DashboardData, hidden: ReadonlySet<string>): DashboardData {
  if (hidden.size === 0) return data;
  let removedExpenses = 0;
  const envelopes = data.envelopes.map((envelope) => {
    const kept = envelope.actuals.filter((a) => !hidden.has(accountKey(a)));
    if (kept.length === envelope.actuals.length) return envelope;
    const removed = round(envelope.actuals.filter((a) => hidden.has(accountKey(a))).reduce((s, a) => s + a.amountIls, 0));
    if (EXPENSES.has(envelope.type)) removedExpenses += removed;
    return { ...envelope, actuals: kept, actual: round(envelope.actual - removed) };
  });
  const variable = envelopes.find((e) => e.type === 'variable');
  return {
    ...data,
    envelopes,
    totalActualExpenses: round(data.totalActualExpenses - removedExpenses),
    variableRemaining: variable
      ? round(Math.max(variable.expected - variable.actual - variable.pendingTotal, 0))
      : data.variableRemaining,
  };
}

/** What localStorage holds: the hidden keys, as a JSON array. */
export function parseHidden(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}
