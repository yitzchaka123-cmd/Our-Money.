import { describe, expect, it } from 'vitest';

import { assembleMonth, type ActualRow, type EnvelopeRow } from '@/lib/dashboard/data';
import { envelopeName, normalizeBudget } from '@/lib/riseup/envelopes';
import {
  buildNameBook,
  envelopeKey,
  resolveTrackerName,
  TRACKER_FALLBACK_NAME,
} from '@/lib/riseup/tracker-names';
import type { RiseupEnvelope } from '@/lib/types';

const CAR = '2026-10#trackingCategory#v2-default-il-expense-category-13';
const CUSTOM = '2026-10#trackingCategory#v2-62d56b95339d9f7b44308a3c';

function actualRow(envelopeId: string, label: string | null, extra: Partial<ActualRow> = {}): ActualRow {
  return {
    envelope_id: envelopeId,
    transaction_id: `${envelopeId}-${label}-${Math.random()}`,
    transaction_date: '2026-09-10',
    billing_date: '2026-09-10',
    business_name: 'פז',
    amount_ils: 10,
    is_income: false,
    account_nickname: null,
    account_number_hash: null,
    source: null,
    is_installment: false,
    payment_number: null,
    total_payments: null,
    category_label: label,
    ...extra,
  };
}

describe('envelopeKey', () => {
  it('takes the part of the id that stays the same from month to month', () => {
    expect(envelopeKey(CAR)).toBe('v2-default-il-expense-category-13');
    expect(envelopeKey('2026-10#trackingCategory#v2-default-il-expense-category-2#3')).toBe('v2-default-il-expense-category-2');
    expect(envelopeKey('2026-10#variable')).toBeNull();
  });
});

describe('resolveTrackerName', () => {
  const empty = buildNameBook({ envelopes: [], actuals: [] });

  it("prefers the envelope's own name field", () => {
    expect(resolveTrackerName({ envelopeId: CAR, direct: 'הרכב שלנו', ownLabels: ['רכב'], book: empty })).toBe('הרכב שלנו');
  });

  it('then the category label most used on its own transactions', () => {
    expect(resolveTrackerName({ envelopeId: CUSTOM, ownLabels: ['כללי', 'יציאות', 'יציאות'], book: empty })).toBe('יציאות');
  });

  it('breaks a tie in favour of the built-in name', () => {
    const tenth = '2026-09#trackingCategory#v2-default-il-expense-category-10';
    expect(resolveTrackerName({ envelopeId: tenth, ownLabels: ['תרומה', 'תרומה', 'חינוך', 'חינוך'], book: empty })).toBe('חינוך');
  });

  it('then the same tracker in another month', () => {
    const book = buildNameBook({
      envelopes: [{ envelope_id: '2026-08#trackingCategory#v2-62d56b95339d9f7b44308a3c', envelope_type: 'trackingCategory', name: 'חוגים' }],
      actuals: [],
    });
    expect(resolveTrackerName({ envelopeId: CUSTOM, ownLabels: [], book })).toBe('חוגים');
  });

  it("learns another month's name from that month's transactions", () => {
    const book = buildNameBook({
      envelopes: [],
      actuals: [actualRow('2026-09#trackingCategory#v2-62d56b95339d9f7b44308a3c', 'חוגים')],
    });
    expect(resolveTrackerName({ envelopeId: CUSTOM, ownLabels: [], book })).toBe('חוגים');
  });

  it('never learns a raw id or the neutral fallback as a name', () => {
    const book = buildNameBook({
      envelopes: [
        { envelope_id: '2026-09#trackingCategory#v2-62d56b95339d9f7b44308a3c', envelope_type: 'trackingCategory', name: '2026-09#trackingCategory#v2-62d56b95339d9f7b44308a3c' },
        { envelope_id: '2026-08#trackingCategory#v2-62d56b95339d9f7b44308a3c', envelope_type: 'trackingCategory', name: TRACKER_FALLBACK_NAME },
      ],
      actuals: [],
    });
    expect(resolveTrackerName({ envelopeId: CUSTOM, ownLabels: [], book })).toBe(TRACKER_FALLBACK_NAME);
  });

  it("then RiseUp's built-in category names", () => {
    expect(resolveTrackerName({ envelopeId: CAR, ownLabels: [], book: empty })).toBe('רכב');
    expect(resolveTrackerName({ envelopeId: '2026-10#trackingCategory#v2-default-il-expense-category-33', ownLabels: [], book: empty })).toBe('פארמה');
    expect(resolveTrackerName({ envelopeId: '2026-10#trackingCategory#v2-default-il-expense-category-28', ownLabels: [], book: empty })).toBe('ביגוד והנעלה');
  });

  it('falls back to a neutral name, never the raw id', () => {
    expect(resolveTrackerName({ envelopeId: CUSTOM, ownLabels: [], book: empty })).toBe(TRACKER_FALLBACK_NAME);
  });
});

describe('naming at sync time', () => {
  it('names a tracker with no transactions from the built-in list', () => {
    const envelope: RiseupEnvelope = { id: CAR, type: 'trackingCategory', balancedAmount: 0, actuals: [] };
    expect(envelopeName(envelope)).toBe('רכב');
  });

  it('names a custom tracker from what the book learned in other months', () => {
    const book = buildNameBook({ envelopes: [], actuals: [actualRow('2026-09#trackingCategory#v2-62d56b95339d9f7b44308a3c', 'חוגים')] });
    const [normalized] = normalizeBudget({ envelopes: [{ id: CUSTOM, type: 'trackingCategory', actuals: [] }] }, book);
    expect(normalized?.name).toBe('חוגים');
  });

  it('keeps the fixed titles for the big envelopes', () => {
    expect(envelopeName({ id: '2026-10#variable', type: 'variable' })).toBe('הוצאות משתנות');
  });
});

describe('naming at load time, for rows stored before the fix', () => {
  it('replaces a stored raw id with a real name', () => {
    const envelopeRows: EnvelopeRow[] = [
      { envelope_id: CAR, envelope_type: 'trackingCategory', name: CAR, planned_ils: 0, position: 0 },
      { envelope_id: CUSTOM, envelope_type: 'trackingCategory', name: CUSTOM, planned_ils: 0, position: 1 },
    ];
    const names = buildNameBook({
      envelopes: [{ envelope_id: '2026-09#trackingCategory#v2-62d56b95339d9f7b44308a3c', envelope_type: 'trackingCategory', name: 'חוגים' }],
      actuals: [],
    });
    const { envelopes } = assembleMonth({
      month: '2026-10',
      envelopeRows,
      actualRows: [],
      spends: [],
      topups: [],
      plans: [],
      skippedPlanIds: new Set(),
      memberNames: new Map(),
      names,
    });
    expect(envelopes.map((e) => e.title).sort()).toEqual(['חוגים', 'רכב']);
    expect(envelopes.every((e) => !e.title.includes('#'))).toBe(true);
  });

  it('works with no name book at all', () => {
    const { envelopes } = assembleMonth({
      month: '2026-10',
      envelopeRows: [{ envelope_id: CUSTOM, envelope_type: 'trackingCategory', name: CUSTOM, planned_ils: 0, position: 0 }],
      actualRows: [actualRow(CUSTOM, 'יציאות')],
      spends: [],
      topups: [],
      plans: [],
      skippedPlanIds: new Set(),
      memberNames: new Map(),
    });
    expect(envelopes[0]?.title).toBe('יציאות');
  });
});
