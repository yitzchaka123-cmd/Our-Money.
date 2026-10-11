import { describe, expect, it } from 'vitest';

import { assembleMonth, monthTotals, type ActualRow, type EnvelopeRow } from '@/lib/dashboard/data';
import {
  addTrackerSlot,
  customTrackerRefs,
  resolveOverride,
  trackerKey,
  type TrackerOverride,
} from '@/lib/dashboard/trackers';
import type { CashSpend } from '@/lib/types';

const MONTH = '2026-10';
const CAR = `${MONTH}#trackingCategory#v2-default-il-expense-category-13#0`;

const envelopeRows: EnvelopeRow[] = [
  { envelope_id: 'var', envelope_type: 'variable', name: null, planned_ils: 5000, position: 0 },
  { envelope_id: 'fix', envelope_type: 'fixed', name: null, planned_ils: 4000, position: 1 },
  { envelope_id: 'inc', envelope_type: 'variableIncome', name: null, planned_ils: 12000, position: 2 },
  { envelope_id: CAR, envelope_type: 'trackingCategory', name: 'רכב', planned_ils: 2850, position: 3 },
];

function row(envelope: string, id: string, amount: number, label: string | null = null, isIncome = false): ActualRow {
  return {
    envelope_id: envelope,
    transaction_id: id,
    transaction_date: `${MONTH}-05`,
    billing_date: `${MONTH}-05`,
    business_name: 'חנות',
    amount_ils: amount,
    is_income: isIncome,
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
  row('var', 'v1', 3000, 'מזון וצריכה'),
  row('var', 'v2', 120, 'פארמה'),
  row('fix', 'f1', 3500),
  row('inc', 'i1', 7000, null, true),
  row(CAR, 'c1', 400, 'רכב'),
];

function cashSpend(overrides: Partial<CashSpend>): CashSpend {
  return {
    id: 's1',
    member_id: 'm1',
    amount_ils: 50,
    category: 'פארמה',
    note: null,
    spent_at: `${MONTH}-07`,
    status: 'confirmed',
    confidence: 'high',
    input_kind: 'web',
    raw_input: null,
    transcript: null,
    telegram_update_id: null,
    telegram_chat_id: null,
    telegram_message_id: null,
    bot_message_id: null,
    envelope_id: 'var',
    envelope_type: 'variable',
    wallet_id: null,
    plan_id: null,
    created_at: `${MONTH}-07T10:00:00Z`,
    ...overrides,
  };
}

function override(o: Partial<TrackerOverride> & { trackerKey: string }): TrackerOverride {
  return { month: '', name: null, targetIls: null, hidden: false, categoryLabel: null, ...o };
}

function month(overrides: TrackerOverride[], spends: CashSpend[] = []) {
  return assembleMonth({
    month: MONTH,
    envelopeRows,
    actualRows,
    spends,
    topups: [],
    plans: [],
    skippedPlanIds: new Set(),
    memberNames: new Map([['m1', 'יצחק']]),
    overrides,
  });
}

const KEY = 'v2-default-il-expense-category-13';

describe('tracker keys', () => {
  it('takes the stable third part of a RiseUp envelope id', () => {
    expect(trackerKey(CAR)).toBe(KEY);
    expect(trackerKey('custom:פארמה')).toBe('custom:פארמה');
    expect(trackerKey('plain-id')).toBe('plain-id');
  });

  it('lets a this-month target win over the every-month one, keeping the name', () => {
    const list = [
      override({ trackerKey: KEY, name: 'האוטו', targetIls: 2000 }),
      override({ trackerKey: KEY, month: MONTH, targetIls: 900 }),
    ];
    expect(resolveOverride(list, KEY, MONTH)).toMatchObject({ name: 'האוטו', targetIls: 900, monthOnly: true });
    expect(resolveOverride(list, KEY, '2026-11')).toMatchObject({ name: 'האוטו', targetIls: 2000, monthOnly: false });
  });
});

describe('overrides in the loader', () => {
  it('changes nothing without overrides', () => {
    const { envelopes } = month([]);
    const car = envelopes.find((e) => e.type === 'trackingCategory')!;
    expect(car).toMatchObject({ title: 'רכב', expected: 2850, actual: 400, trackerKey: KEY });
    expect(car.override).toBeUndefined();
  });

  it('renames and retargets a RiseUp tracker on our side, and the forecast follows the target', () => {
    const before = monthTotals(month([]).envelopes).forecast;
    const { envelopes } = month([override({ trackerKey: KEY, name: 'האוטו', targetIls: 2000 })]);
    const car = envelopes.find((e) => e.type === 'trackingCategory')!;
    expect(car.title).toBe('האוטו');
    expect(car.expected).toBe(2000);
    expect(car.override).toMatchObject({ riseupName: 'רכב', riseupTarget: 2850, renamed: true, retargeted: true, custom: false });
    expect(monthTotals(envelopes).forecast).toBe(before + 850);
  });

  it('hides a tracker: its spending and budget go back to variable expenses, the forecast unchanged', () => {
    const before = monthTotals(month([]).envelopes).forecast;
    const { envelopes, riseupEnvelopes } = month([override({ trackerKey: KEY, hidden: true })]);
    expect(envelopes.some((e) => e.type === 'trackingCategory')).toBe(false);
    expect(riseupEnvelopes.some((e) => e.type === 'trackingCategory')).toBe(false);
    const variable = envelopes.find((e) => e.type === 'variable')!;
    expect(variable.actual).toBe(3000 + 120 + 400);
    expect(variable.expected).toBe(5000 + 2850);
    expect(monthTotals(envelopes).forecast).toBe(before);
  });

  it('adds a tracker of our own that collects variable spending with its label, card and cash alike', () => {
    const before = monthTotals(month([]).envelopes).forecast;
    const { envelopes, riseupEnvelopes } = month(
      [override({ trackerKey: 'custom:פארמה', categoryLabel: 'פארמה', targetIls: 450 })],
      [cashSpend({})],
    );
    const pharm = envelopes.find((e) => e.key === 'custom:פארמה')!;
    expect(pharm).toMatchObject({ type: 'trackingCategory', title: 'פארמה', expected: 450, actual: 170, showRemaining: true });
    expect(pharm.override).toMatchObject({ custom: true, categoryLabel: 'פארמה' });
    const variable = envelopes.find((e) => e.type === 'variable')!;
    expect(variable.actual).toBe(3000);
    expect(variable.expected).toBe(5000 - 450);
    // Carved out of the variable budget, so the forecast does not move.
    expect(monthTotals(envelopes).forecast).toBe(before);
    expect(riseupEnvelopes.some((e) => e.envelopeId === 'custom:פארמה')).toBe(true);
  });

  it('files a cash spend pinned to our tracker into it', () => {
    const { envelopes } = month(
      [override({ trackerKey: 'custom:פארמה', categoryLabel: 'פארמה', targetIls: 450, name: 'בית מרקחת' })],
      [cashSpend({ category: 'אחר', envelope_id: 'custom:פארמה', envelope_type: 'trackingCategory' })],
    );
    const pharm = envelopes.find((e) => e.key === 'custom:פארמה')!;
    expect(pharm.title).toBe('בית מרקחת');
    expect(pharm.actual).toBe(170);
  });

  it('does not add our own tracker for a category RiseUp already tracks', () => {
    const { envelopes } = month([override({ trackerKey: 'custom:רכב', categoryLabel: 'רכב', targetIls: 100 })]);
    expect(envelopes.filter((e) => e.type === 'trackingCategory')).toHaveLength(1);
  });

  it("replaces RiseUp's expected income with ours, never below what already came in", () => {
    const before = monthTotals(month([]).envelopes).forecast;
    const up = month([override({ trackerKey: 'income', month: MONTH, targetIls: 13000 })]).envelopes;
    expect(up.find((e) => e.type === 'variableIncome')!.expected).toBe(13000);
    expect(monthTotals(up).forecast).toBe(before + 1000);
    const low = month([override({ trackerKey: 'income', month: MONTH, targetIls: 100 })]).envelopes;
    expect(low.find((e) => e.type === 'variableIncome')!.expected).toBe(7000);
    // Another month's income override does not leak in.
    const other = month([override({ trackerKey: 'income', month: '2026-09', targetIls: 100 })]).envelopes;
    expect(other.find((e) => e.type === 'variableIncome')!.expected).toBe(12000);
  });

  it('offers our own trackers to code that files cash from the database', () => {
    const refs = customTrackerRefs(
      [
        override({ trackerKey: 'custom:פארמה', categoryLabel: 'פארמה', targetIls: 450 }),
        override({ trackerKey: 'custom:ישן', categoryLabel: 'ישן', hidden: true }),
      ],
      MONTH,
      [],
    );
    expect(refs).toEqual([{ envelopeId: 'custom:פארמה', type: 'trackingCategory', name: 'פארמה', categoryLabels: ['פארמה'] }]);
  });
});

describe('the add-tracker button', () => {
  it('follows the last tracker, or the variable card when nothing is tracked', () => {
    const cards = [
      { key: 'var', type: 'variable' },
      { key: 'a', type: 'trackingCategory' },
      { key: 'b', type: 'trackingCategory' },
      { key: 'fix', type: 'fixed' },
    ];
    expect(addTrackerSlot(cards)).toBe('b');
    expect(addTrackerSlot(cards.filter((c) => c.type !== 'trackingCategory'))).toBe('var');
    expect(addTrackerSlot([])).toBeNull();
  });
});
