import { describe, expect, it } from 'vitest';

import type { CashPlan } from '@/lib/cash/plans';
import { assembleMonth, monthTotals, type ActualRow, type EnvelopeRow } from '@/lib/dashboard/data';
import type { CashSpend, CashTopup } from '@/lib/types';

const names = new Map([
  ['m1', 'יצחק'],
  ['m2', 'שרה'],
]);

const envelopeRows: EnvelopeRow[] = [
  { envelope_id: 'var', envelope_type: 'variable', name: null, planned_ils: 5000, position: 0 },
  { envelope_id: 'fix', envelope_type: 'fixed', name: null, planned_ils: 4000, position: 1 },
  { envelope_id: 'inc', envelope_type: 'variableIncome', name: null, planned_ils: 12000, position: 2 },
];

function actual(envelope: string, id: string, amount: number, name = 'חנות', isIncome = false): ActualRow {
  return {
    envelope_id: envelope,
    transaction_id: id,
    transaction_date: '2026-09-05',
    billing_date: '2026-09-05',
    business_name: name,
    amount_ils: amount,
    is_income: isIncome,
    account_nickname: null,
    account_number_hash: null,
    source: null,
    is_installment: false,
    payment_number: null,
    total_payments: null,
    category_label: null,
  };
}

const actualRows: ActualRow[] = [
  actual('var', 'v1', 3000),
  actual('fix', 'f1', 3500),
  actual('inc', 'i1', 12000, 'משכורת', true),
  // A withdrawal is cash changing hands, not spending: it must not count.
  actual('var', 'atm', 500, 'משיכת מזומן'),
];

function spend(overrides: Partial<CashSpend>): CashSpend {
  return {
    id: 's1',
    member_id: 'm1',
    amount_ils: 100,
    category: 'סופר',
    note: null,
    spent_at: '2026-09-10',
    status: 'confirmed',
    confidence: 'high',
    input_kind: 'web',
    raw_input: null,
    transcript: null,
    telegram_update_id: null,
    telegram_chat_id: null,
    telegram_message_id: null,
    bot_message_id: null,
    envelope_id: null,
    envelope_type: null,
    wallet_id: null,
    plan_id: null,
    created_at: '2026-09-10T10:00:00Z',
    ...overrides,
  };
}

function plan(overrides: Partial<CashPlan>): CashPlan {
  return {
    id: 'p1',
    kind: 'spend',
    amount_ils: 800,
    category: 'ניקיון',
    note: 'עוזרת בית',
    envelope_type: 'fixed',
    envelope_name: null,
    day_of_month: 20,
    recurrence: 'monthly',
    starts_month: '2026-01',
    ends_month: null,
    wallet_id: null,
    member_id: null,
    is_active: true,
    ...overrides,
  };
}

function income(overrides: Partial<CashTopup>): CashTopup {
  return {
    id: 't1',
    amount_ils: 1200,
    occurred_at: '2026-09-25',
    source: 'cash_income',
    riseup_transaction_id: null,
    business_name: null,
    note: 'שיעורים',
    is_dismissed: false,
    member_id: 'm2',
    category: 'משכורת במזומן',
    input_kind: 'web',
    wallet_id: null,
    plan_id: null,
    ...overrides,
  };
}

function month(extra: { spends?: CashSpend[]; topups?: CashTopup[]; plans?: CashPlan[]; skipped?: string[] } = {}) {
  return assembleMonth({
    month: '2026-09',
    envelopeRows,
    actualRows,
    spends: extra.spends ?? [],
    topups: extra.topups ?? [],
    plans: extra.plans ?? [],
    skippedPlanIds: new Set(extra.skipped ?? []),
    memberNames: names,
  }).envelopes;
}

describe('assembleMonth', () => {
  it("reproduces RiseUp's own forecast when there is no cash at all", () => {
    const envelopes = month();
    expect(envelopes.find((e) => e.type === 'variable')?.actual).toBe(3000);
    expect(monthTotals(envelopes).forecast).toBe(12000 - 5000 - 4000);
  });

  it('shows a pending cleaner in the fixed envelope and takes it off the forecast', () => {
    const envelopes = month({ plans: [plan({})] });
    const fixed = envelopes.find((e) => e.type === 'fixed')!;
    expect(fixed.pending).toHaveLength(1);
    expect(fixed.pending[0]).toMatchObject({ amountIls: 800, date: '2026-09-20', label: 'עוזרת בית', envelopeId: 'fix' });
    expect(fixed.expected).toBe(4800);
    expect(monthTotals(envelopes).forecast).toBe(12000 - 5000 - 4800);
  });

  it('turns the pending row into a real row once paid, without moving the forecast', () => {
    const paid = spend({ id: 's-clean', amount_ils: 800, category: 'ניקיון', envelope_id: 'fix', envelope_type: 'fixed', plan_id: 'p1' });
    const envelopes = month({ plans: [plan({})], spends: [paid] });
    const fixed = envelopes.find((e) => e.type === 'fixed')!;
    expect(fixed.pending).toHaveLength(0);
    expect(fixed.actual).toBe(4300);
    expect(fixed.expected).toBe(4800);
    expect(monthTotals(envelopes).forecast).toBe(12000 - 5000 - 4800);
  });

  it('drops a skipped month from both the list and the forecast', () => {
    const envelopes = month({ plans: [plan({})], skipped: ['p1'] });
    expect(envelopes.find((e) => e.type === 'fixed')?.pending).toHaveLength(0);
    expect(monthTotals(envelopes).forecast).toBe(3000);
  });

  it('absorbs ad-hoc cash inside the variable budget', () => {
    const envelopes = month({ spends: [spend({ amount_ils: 400 })] });
    const variable = envelopes.find((e) => e.type === 'variable')!;
    expect(variable.actual).toBe(3400);
    expect(variable.expected).toBe(5000);
  });

  it('stands up the cash income envelope for an income that is only expected so far', () => {
    const envelopes = month({ plans: [plan({ id: 'p-tutor', kind: 'income', envelope_type: null, category: 'שיעורים', amount_ils: 1200, member_id: 'm2' })] });
    const cash = envelopes.find((e) => e.type === 'cashIncome')!;
    expect(cash.actual).toBe(0);
    expect(cash.expected).toBe(1200);
    expect(cash.pending[0]?.memberName).toBe('שרה');
    expect(monthTotals(envelopes).forecast).toBe(12000 + 1200 - 5000 - 4000);
  });

  it('counts received cash income plus what is still due', () => {
    const envelopes = month({
      topups: [income({ amount_ils: 350, plan_id: null })],
      plans: [plan({ id: 'p-tutor', kind: 'income', envelope_type: null, amount_ils: 1200 })],
    });
    expect(envelopes.find((e) => e.type === 'cashIncome')?.expected).toBe(1550);
  });
});
