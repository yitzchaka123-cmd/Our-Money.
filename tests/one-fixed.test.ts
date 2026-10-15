import { describe, expect, it } from 'vitest';

import { envelopeChoices } from '@/lib/cash/envelopes';
import { buildBuckets } from '@/lib/dashboard/buckets';
import { assembleMonth, monthTotals, type ActualRow, type EnvelopeRow } from '@/lib/dashboard/data';
import { mergeRiseupEnvelopes } from '@/lib/dashboard/merge-envelopes';
import { ENVELOPE_ORDER } from '@/lib/riseup/envelopes';
import { buildNameBook } from '@/lib/riseup/tracker-names';
import type { CashSpend } from '@/lib/types';

const M = '2026-10';
const fix = (key: string) => `${M}#fixed#${key}`;
const grocery = (part: number) => `${M}#trackingCategory#v2-default-il-expense-category-2#${part}`;

const envelopeRows: EnvelopeRow[] = [
  { envelope_id: fix('aaa'), envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 55, position: 0 },
  { envelope_id: fix('bbb'), envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 1842.36, position: 1 },
  { envelope_id: fix('ccc'), envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 114, position: 2 },
  { envelope_id: fix('ddd'), envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 74.79, position: 3 },
  { envelope_id: fix('eee'), envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 0, position: 4 },
  { envelope_id: `${M}#trackingCategory#v2-default-il-expense-category-13`, envelope_type: 'trackingCategory', name: 'רכב', planned_ils: 2850, position: 5 },
  { envelope_id: grocery(0), envelope_type: 'trackingCategory', name: 'כלכלה', planned_ils: 300, position: 6 },
  { envelope_id: grocery(1), envelope_type: 'trackingCategory', name: 'כלכלה', planned_ils: 300, position: 7 },
  { envelope_id: `${M}#trackingCategory#v2-default-il-expense-category-33`, envelope_type: 'trackingCategory', name: 'פארמה', planned_ils: 450, position: 8 },
  { envelope_id: `${M}#variableIncome`, envelope_type: 'variableIncome', name: 'הכנסות', planned_ils: 7635, position: 9 },
  { envelope_id: `${M}#variable`, envelope_type: 'variable', name: 'הוצאות משתנות', planned_ils: 2000, position: 10 },
  { envelope_id: `${M}#riseupGoal`, envelope_type: 'riseupGoal', name: 'הפקדות לחיסכון', planned_ils: 0, position: 11 },
];

function row(envelopeId: string, id: string, amount: number, label: string | null, date = '2026-10-03', name = 'עסק'): ActualRow {
  return {
    envelope_id: envelopeId,
    transaction_id: id,
    transaction_date: date,
    billing_date: date,
    business_name: name,
    amount_ils: amount,
    is_income: false,
    account_nickname: null,
    account_number_hash: null,
    source: null,
    is_installment: false,
    payment_number: null,
    total_payments: null,
    category_label: label,
  };
}

const actualRows: ActualRow[] = [
  row(fix('bbb'), 'loan', 1821.85, 'הלוואה'),
  row(fix('ccc'), 'phone', 114, 'תשלומים'),
  row(fix('ddd'), 'ins', 75.29, 'ביטוח'),
  row(grocery(0), 'super1', 30, 'כלכלה', '2026-10-02'),
  row(grocery(1), 'super2', 20, 'כלכלה', '2026-10-06'),
];

// September taught us what the still-expected charge `aaa` is.
const names = buildNameBook({
  envelopes: [],
  actuals: [{ envelope_id: `2026-09#fixed#aaa`, category_label: 'RiseUp', business_name: 'רייזאפ', transaction_date: '2026-09-12' }],
});

function spend(overrides: Partial<CashSpend>): CashSpend {
  return {
    id: 's1', member_id: 'm1', amount_ils: 40, category: 'משהו', note: null, spent_at: '2026-10-05',
    status: 'confirmed', confidence: 'high', input_kind: 'web', raw_input: null, transcript: null,
    telegram_update_id: null, telegram_chat_id: null, telegram_message_id: null, bot_message_id: null,
    envelope_id: null, envelope_type: null, wallet_id: null, plan_id: null, created_at: '2026-10-05T10:00:00Z',
    ...overrides,
  };
}

function month(spends: CashSpend[] = []) {
  return assembleMonth({
    month: M,
    envelopeRows,
    actualRows,
    spends,
    topups: [],
    plans: [],
    skippedPlanIds: new Set(),
    memberNames: new Map([['m1', 'יצחק']]),
    names,
  });
}

describe('one fixed-expenses card', () => {
  it('merges every fixed charge of the month into a single envelope', () => {
    const fixed = month().envelopes.filter((e) => e.type === 'fixed');
    expect(fixed).toHaveLength(1);
    expect(fixed[0]).toMatchObject({ title: 'הוצאות קבועות', envelopeId: fix('aaa') });
    expect(fixed[0]?.actual).toBe(2011.14);
  });

  it("expects the sum of every charge's plan, the ones still to come included", () => {
    const fixed = month().envelopes.find((e) => e.type === 'fixed')!;
    // 55 (still to come) + 1842.36 + 114 + 74.79 + 0.
    expect(fixed.expected).toBe(2086.15);
  });

  it('lists the charges still expected this month, named from earlier months', () => {
    const fixed = month().envelopes.find((e) => e.type === 'fixed')!;
    expect(fixed.upcoming).toEqual([
      { key: fix('aaa'), amountIls: 55, categoryLabel: 'RiseUp', businessName: 'רייזאפ' },
    ]);
  });

  it('groups the breakdown by category, still-expected rows included', () => {
    const fixed = month().envelopes.find((e) => e.type === 'fixed')!;
    const buckets = buildBuckets('fixed', fixed.actuals, { month: M, upcoming: fixed.upcoming });
    expect(buckets.map((b) => [b.label, b.actual, b.expected])).toEqual([
      ['הלוואה', 1821.85, 1821.85],
      ['תשלומים', 114, 114],
      ['ביטוח', 75.29, 75.29],
      ['RiseUp', 0, 55],
    ]);
    expect(buckets[3]).toMatchObject({ isEmpty: false, isUpcoming: true });
    expect(buckets[3]?.upcoming).toHaveLength(1);
  });

  it('files cash pinned to any of the old fixed ids into the one card', () => {
    const { envelopes } = month([spend({ id: 'c-fixed', envelope_id: fix('ccc'), envelope_type: 'fixed', amount_ils: 800 })]);
    const fixed = envelopes.find((e) => e.type === 'fixed')!;
    expect(fixed.actuals.some((a) => a.cash?.id === 'c-fixed')).toBe(true);
    expect(fixed.actual).toBe(2811.14);
  });

  it('counts the fixed card once in the forecast', () => {
    const { envelopes } = month();
    const totals = monthTotals(envelopes);
    // Income 7635 − variable 2000 − fixed 2086.15 − trackers (2850 + 600 + 450).
    expect(totals.forecast).toBe(-351.15);
  });
});

describe('trackers split into weekly parts', () => {
  it('show as one card with the parts summed', () => {
    const groceries = month().envelopes.filter((e) => e.title === 'כלכלה');
    expect(groceries).toHaveLength(1);
    expect(groceries[0]).toMatchObject({ actual: 50, expected: 600, weekly: true, envelopeId: grocery(0) });
  });

  it('files cash pinned to a later week into the same card', () => {
    const { envelopes } = month([spend({ id: 'c-week', envelope_id: grocery(1), envelope_type: 'trackingCategory', amount_ils: 25 })]);
    expect(envelopes.find((e) => e.title === 'כלכלה')?.actual).toBe(75);
  });
});

describe("RiseUp's order", () => {
  it('puts variable, then trackers, then fixed, then income, cash income and savings', () => {
    expect(ENVELOPE_ORDER).toEqual(['variable', 'trackingCategory', 'fixed', 'variableIncome', 'fixedIncome', 'cashIncome', 'riseupGoal']);
    expect(month().envelopes.map((e) => e.title)).toEqual([
      'הוצאות משתנות',
      'רכב',
      'כלכלה',
      'פארמה',
      'הוצאות קבועות',
      'הכנסות',
      'הפקדות לחיסכון',
    ]);
  });
});

describe('envelope pickers', () => {
  it('list each envelope once', () => {
    const { riseupEnvelopes } = month();
    const choices = envelopeChoices(
      riseupEnvelopes.map((e) => ({ envelopeId: e.envelopeId, type: e.type, name: e.name })),
    );
    const names = choices.map((c) => c.name);
    expect(names.filter((n) => n === 'הוצאות קבועות')).toHaveLength(1);
    expect(names.filter((n) => n === 'כלכלה')).toHaveLength(1);
  });

  it('list each envelope once even from raw stored rows (the daily page)', () => {
    const raw = envelopeRows.map((r) => ({
      envelopeId: r.envelope_id,
      type: r.envelope_type as 'fixed' | 'trackingCategory' | 'variable' | 'variableIncome' | 'riseupGoal',
      name: r.envelope_type === 'trackingCategory' ? r.envelope_id : (r.name ?? ''),
      categoryLabels: r.envelope_id === fix('bbb') ? ['הלוואה'] : r.envelope_id === fix('ddd') ? ['ביטוח'] : [],
    }));
    const choices = envelopeChoices(raw);
    expect(choices.map((c) => c.name)).toEqual(['הוצאות משתנות', 'הוצאות קבועות', 'כלכלה', 'פארמה', 'רכב']);
    // The one fixed choice still knows every label its charges were filed under.
    expect(choices.find((c) => c.type === 'fixed')?.categoryLabels?.sort()).toEqual(['ביטוח', 'הלוואה']);
  });
});

describe('mergeRiseupEnvelopes', () => {
  it('leaves a month with a single fixed envelope alone', () => {
    const single = [
      { envelopeId: 'fix', type: 'fixed' as const, name: 'הוצאות קבועות', plannedIls: 4000, actualIls: 3500, position: 0, actuals: [] },
    ];
    const { envelopes, aliases } = mergeRiseupEnvelopes(single);
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]?.envelopeId).toBe('fix');
    expect(aliases.size).toBe(0);
  });
});
