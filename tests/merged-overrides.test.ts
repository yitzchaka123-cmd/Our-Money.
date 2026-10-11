import { describe, expect, it } from 'vitest';

import { assembleMonth, type ActualRow, type EnvelopeRow } from '@/lib/dashboard/data';
import type { TrackerOverride } from '@/lib/dashboard/trackers';
import { buildNameBook } from '@/lib/riseup/tracker-names';
import type { CashSpend } from '@/lib/types';

/**
 * Our own tracker overrides (names, targets, hiding) laid over the cards as
 * RiseUp shows them: every fixed charge in one card, a weekly tracker as one
 * card, and trackers named from the name book.
 */

const M = '2026-10';
const GROCERY = 'v2-default-il-expense-category-2';
const PHARM = 'v2-default-il-expense-category-33';
const grocery = (part: number) => `${M}#trackingCategory#${GROCERY}#${part}`;
const pharm = `${M}#trackingCategory#${PHARM}#0`;

const envelopeRows: EnvelopeRow[] = [
  { envelope_id: `${M}#fixed#aaa`, envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 100, position: 0 },
  { envelope_id: `${M}#fixed#bbb`, envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 200, position: 1 },
  { envelope_id: grocery(0), envelope_type: 'trackingCategory', name: 'כלכלה', planned_ils: 300, position: 2 },
  { envelope_id: grocery(1), envelope_type: 'trackingCategory', name: 'כלכלה', planned_ils: 300, position: 3 },
  // Stored before trackers had names: the raw id.
  { envelope_id: pharm, envelope_type: 'trackingCategory', name: pharm, planned_ils: 450, position: 4 },
  { envelope_id: `${M}#variable`, envelope_type: 'variable', name: 'הוצאות משתנות', planned_ils: 2000, position: 5 },
  { envelope_id: `${M}#variableIncome`, envelope_type: 'variableIncome', name: 'הכנסות', planned_ils: 7000, position: 6 },
];

function row(envelopeId: string, id: string, amount: number, label: string | null): ActualRow {
  return {
    envelope_id: envelopeId,
    transaction_id: id,
    transaction_date: `${M}-05`,
    billing_date: `${M}-05`,
    business_name: 'עסק',
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
  row(`${M}#fixed#aaa`, 'f1', 100, 'ביטוח'),
  row(grocery(0), 'g1', 30, 'כלכלה'),
  row(grocery(1), 'g2', 20, 'כלכלה'),
  row(`${M}#variable`, 'v1', 500, 'מסעדות'),
];

// September taught us the pharmacy tracker's name.
const names = buildNameBook({
  envelopes: [],
  actuals: [{ envelope_id: `2026-09#trackingCategory#${PHARM}#0`, category_label: 'פארמה' }],
});

function spend(o: Partial<CashSpend>): CashSpend {
  return {
    id: 's1',
    member_id: 'm1',
    amount_ils: 25,
    category: 'כלכלה',
    note: null,
    spent_at: `${M}-07`,
    status: 'confirmed',
    confidence: 'high',
    input_kind: 'web',
    raw_input: null,
    transcript: null,
    telegram_update_id: null,
    telegram_chat_id: null,
    telegram_message_id: null,
    bot_message_id: null,
    envelope_id: grocery(1),
    envelope_type: 'trackingCategory',
    wallet_id: null,
    plan_id: null,
    created_at: `${M}-07T10:00:00Z`,
    ...o,
  };
}

function override(o: Partial<TrackerOverride> & { trackerKey: string }): TrackerOverride {
  return { month: '', name: null, targetIls: null, hidden: false, categoryLabel: null, ...o };
}

function month(overrides: TrackerOverride[], spends: CashSpend[] = []) {
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
    overrides,
  }).envelopes;
}

describe('overrides on the merged cards', () => {
  it('without overrides: one fixed card, one weekly grocery card, the pharmacy named from the name book', () => {
    const envelopes = month([]);
    expect(envelopes.filter((e) => e.type === 'fixed')).toHaveLength(1);
    const trackers = envelopes.filter((e) => e.type === 'trackingCategory');
    expect(trackers.map((t) => [t.title, t.trackerKey, t.weekly ?? false])).toEqual([
      ['כלכלה', GROCERY, true],
      ['פארמה', PHARM, false],
    ]);
    expect(trackers[0]).toMatchObject({ actual: 50, expected: 600 });
    expect(trackers.every((t) => t.override === undefined)).toBe(true);
  });

  it('a name and target of our own win over the merged weekly tracker and the name book', () => {
    const envelopes = month([
      override({ trackerKey: GROCERY, name: 'סופר', targetIls: 900 }),
      override({ trackerKey: PHARM, name: 'בית מרקחת' }),
    ]);
    const [groceryCard, pharmCard] = envelopes.filter((e) => e.type === 'trackingCategory');
    expect(groceryCard).toMatchObject({ title: 'סופר', expected: 900, actual: 50, weekly: true, trackerKey: GROCERY });
    expect(groceryCard!.override).toMatchObject({ riseupName: 'כלכלה', riseupTarget: 600, renamed: true, retargeted: true });
    expect(pharmCard).toMatchObject({ title: 'בית מרקחת', trackerKey: PHARM });
    expect(pharmCard!.override).toMatchObject({ riseupName: 'פארמה', renamed: true });
  });

  it('cash filed into a later week lands in the merged card, also when we renamed it', () => {
    const envelopes = month([override({ trackerKey: GROCERY, name: 'סופר' })], [spend({})]);
    const groceryCard = envelopes.find((e) => e.trackerKey === GROCERY)!;
    expect(groceryCard.actual).toBe(75);
    expect(groceryCard.actuals.some((a) => a.cash?.id === 's1')).toBe(true);
  });

  it('hiding the merged weekly tracker hands every week, and its cash, back to variable expenses', () => {
    const envelopes = month([override({ trackerKey: GROCERY, hidden: true })], [spend({})]);
    expect(envelopes.find((e) => e.trackerKey === GROCERY)).toBeUndefined();
    const variable = envelopes.find((e) => e.type === 'variable')!;
    expect(variable.actual).toBe(575);
    expect(variable.expected).toBe(2600);
  });
});
