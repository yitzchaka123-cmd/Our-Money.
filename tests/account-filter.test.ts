import { describe, expect, it } from 'vitest';

import { CASH_ACCOUNT, filterDashboard, listAccounts, parseHidden } from '@/lib/dashboard/account-filter';
import type { DashboardData, EnvelopeView } from '@/lib/dashboard/data';
import type { NormalizedActual } from '@/lib/riseup/envelopes';

function row(id: string, amount: number, extra: Partial<NormalizedActual> = {}): NormalizedActual {
  return {
    transactionId: id,
    transactionDate: '2026-10-05',
    billingDate: '2026-10-05',
    businessName: 'חנות',
    amountIls: amount,
    isIncome: false,
    accountNickname: null,
    accountNumberHash: null,
    source: null,
    isInstallment: false,
    paymentNumber: null,
    totalPayments: null,
    categoryLabel: null,
    ...extra,
  };
}

const card = { source: 'leumiCard', accountNumberHash: 'cc5910' };
const bank = { source: 'leumi', accountNumberHash: 'b1234', accountNickname: 'עו״ש לאומי' };
const cash = { source: 'cash', accountNickname: 'מזומן', cash: { id: 'c', kind: 'spend' as const, memberName: null, inputKind: 'web' as const, status: 'confirmed' as const, walletId: null } };

function envelope(type: EnvelopeView['type'], actuals: NormalizedActual[], expected: number): EnvelopeView {
  const actual = actuals.reduce((s, a) => s + a.amountIls, 0);
  return { key: type, envelopeId: type, type, title: type, actual, expected, actuals, showRemaining: false, pending: [], pendingTotal: 0 };
}

const data = {
  envelopes: [
    envelope('variable', [row('v1', 100, card), row('v2', 40, cash), row('v3', 60, bank)], 1000),
    envelope('fixed', [row('f1', 500, bank)], 600),
    envelope('variableIncome', [row('i1', 7000, { ...bank, isIncome: true })], 7000),
  ],
  totalActualExpenses: 700,
  totalExpectedExpenses: 1600,
  variableRemaining: 800,
  forecast: 5400,
} as unknown as DashboardData;

describe('account filter', () => {
  it('lists each card and account once, with cash last', () => {
    expect(listAccounts(data.envelopes)).toEqual([
      { key: 'leumiCard:cc5910', label: 'cc5910', cash: false },
      { key: 'leumi:b1234', label: 'עו״ש לאומי', cash: false },
      { key: CASH_ACCOUNT, label: 'מזומן', cash: true },
    ]);
  });

  it('changes nothing when every account is shown', () => {
    expect(filterDashboard(data, new Set())).toBe(data);
  });

  it("drops an unticked account's rows from breakdowns and spent-so-far, but not the plan", () => {
    const shown = filterDashboard(data, new Set(['leumi:b1234']));
    const variable = shown.envelopes.find((e) => e.type === 'variable')!;
    expect(variable.actuals.map((a) => a.transactionId)).toEqual(['v1', 'v2']);
    expect(variable.actual).toBe(140);
    expect(shown.envelopes.find((e) => e.type === 'fixed')!.actual).toBe(0);
    expect(shown.envelopes.find((e) => e.type === 'variableIncome')!.actual).toBe(0);
    expect(shown.totalActualExpenses).toBe(140);
    expect(shown.variableRemaining).toBe(860);
    // Expected figures and the forecast are plans, not rows: they stay.
    expect(shown.envelopes.find((e) => e.type === 'fixed')!.expected).toBe(600);
    expect(shown.forecast).toBe(5400);
  });

  it('hides cash as one account', () => {
    const shown = filterDashboard(data, new Set([CASH_ACCOUNT]));
    expect(shown.envelopes.find((e) => e.type === 'variable')!.actual).toBe(160);
  });

  it('reads stored choices defensively', () => {
    expect([...parseHidden('["cash","leumi:b1234"]')]).toEqual(['cash', 'leumi:b1234']);
    expect(parseHidden('not json').size).toBe(0);
    expect(parseHidden('{"a":1}').size).toBe(0);
    expect(parseHidden(null).size).toBe(0);
  });
});
