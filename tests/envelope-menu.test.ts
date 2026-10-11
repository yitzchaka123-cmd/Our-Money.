import { describe, expect, it } from 'vitest';

import { menuItems } from '@/app/dashboard/components/EnvelopeMenu';
import type { EnvelopeView } from '@/lib/dashboard/data';
import type { NormalizedActual } from '@/lib/riseup/envelopes';

function envelope(type: EnvelopeView['type'], actuals: NormalizedActual[] = []): EnvelopeView {
  return { key: type, envelopeId: type, type, title: type, actual: 0, expected: 0, actuals, showRemaining: false, pending: [], pendingTotal: 0 };
}

function cashIncome(id: string): NormalizedActual {
  return {
    transactionId: `cash-income:${id}`,
    transactionDate: '2026-10-05',
    billingDate: '2026-10-05',
    businessName: 'מתנה',
    amountIls: 100,
    isIncome: true,
    accountNickname: 'מזומן',
    accountNumberHash: null,
    source: 'cash',
    isInstallment: false,
    paymentNumber: null,
    totalPayments: null,
    categoryLabel: 'מתנה',
    cash: { id, kind: 'income', memberName: null, inputKind: 'web', status: 'confirmed', walletId: null },
  };
}

const labels = (e: EnvelopeView) => menuItems(e).map((i) => i.label);

describe('envelope ⋮ menu', () => {
  it("gives a tracker RiseUp's own four first", () => {
    expect(labels(envelope('trackingCategory')).slice(0, 4)).toEqual(['חודשים קודמים', 'עריכת סכום', 'עריכת שם', 'מחיקה מהתזרים']);
  });

  it("gives RiseUp's income its menu: previous months, expected income, move several, add", () => {
    expect(menuItems(envelope('variableIncome')).map((i) => [i.action, i.label])).toEqual([
      ['history', 'חודשים קודמים'],
      ['income-target', 'עדכון הכנסה צפויה'],
      ['move-incomes', 'העברת כמה הכנסות יחד'],
      ['add-income', 'הוספת הכנסה'],
    ]);
  });

  it('offers moving several cash incomes only when there are several', () => {
    expect(labels(envelope('cashIncome', [cashIncome('a')]))).not.toContain('העברת כמה הכנסות יחד');
    expect(labels(envelope('cashIncome', [cashIncome('a'), cashIncome('b')]))).toContain('העברת כמה הכנסות יחד');
  });

  it('keeps the variable envelope as it was', () => {
    expect(labels(envelope('variable'))).toEqual([
      'הוספת הוצאה במזומן כאן',
      'הוצאה צפויה במזומן — קבועה או חד־פעמית',
      'חודשים קודמים',
      'כל התכנונים במזומן',
    ]);
  });
});
