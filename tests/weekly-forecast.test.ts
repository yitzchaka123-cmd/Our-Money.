import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ForecastSheet } from '@/app/dashboard/components/ForecastSheet';
import { buildBuckets, weeklyExpected } from '@/lib/dashboard/buckets';
import { assembleMonth, monthTotals, type ActualRow, type EnvelopeRow } from '@/lib/dashboard/data';
import { forecastBreakdown } from '@/lib/dashboard/forecast-breakdown';
import type { TrackerOverride } from '@/lib/dashboard/trackers';
import { buildNameBook } from '@/lib/riseup/tracker-names';
import type { CashSpend } from '@/lib/types';

/**
 * V2-18. The weekly supermarket tracker as RiseUp sent it in October 2026:
 * five parts, `…#v2-default-il-expense-category-2#0..#4`, one per calendar
 * week (Sun–Sat; the 1st is a Thursday), planned 338.97 then 677.94 × 4.
 * By the 15th (week 3) only week 3 had spending: 543.53.
 *
 * RiseUp counts a week that is over at what was spent in it, and the
 * current and later weeks at their plan or what was spent, if more:
 *   0 + 0 + max(677.94, 543.53) + 677.94 + 677.94 = 2,033.82
 * (our old figure was the plans' sum, 3,050.73 — 1,016.91 more).
 */
const OCT = '2026-10';
const part = (k: number) => `${OCT}#trackingCategory#v2-default-il-expense-category-2#${k}`;
const PLANS = [338.97, 677.94, 677.94, 677.94, 677.94];

const envelopeRows: EnvelopeRow[] = [
  ...PLANS.map((planned, k) => ({ envelope_id: part(k), envelope_type: 'trackingCategory', name: 'סופר', planned_ils: planned, position: k })),
  { envelope_id: `${OCT}#fixed#loan`, envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 1842.36, position: 5 },
  { envelope_id: `${OCT}#fixed#water`, envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 120.5, position: 6 },
  { envelope_id: `${OCT}#fixed#gym`, envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 199, position: 7 },
  { envelope_id: `${OCT}#variableIncome`, envelope_type: 'variableIncome', name: 'הכנסות', planned_ils: 7635, position: 8 },
  { envelope_id: `${OCT}#variable`, envelope_type: 'variable', name: 'הוצאות משתנות', planned_ils: 0, position: 9 },
];

function row(envelopeId: string, id: string, amount: number, date: string, label = 'כלכלה'): ActualRow {
  return {
    envelope_id: envelopeId,
    transaction_id: id,
    transaction_date: date,
    billing_date: date,
    business_name: 'שופרסל',
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
  row(part(2), 't1', 60, '2026-10-15'),
  row(part(2), 't2', 19.98, '2026-10-15'),
  row(part(2), 't3', 15, '2026-10-15'),
  row(part(2), 't4', 448.55, '2026-10-15'),
  row(`${OCT}#fixed#loan`, 'loan', 1821.85, '2026-10-02', 'הלוואה'),
];

// September taught us the names of the two fixed charges not charged yet.
const names = buildNameBook({
  envelopes: [],
  actuals: [
    { envelope_id: '2026-09#fixed#water', category_label: 'מים', business_name: 'מי אביבים', transaction_date: '2026-09-20' },
    { envelope_id: '2026-09#fixed#gym', category_label: 'ספורט', business_name: 'הולמס פלייס', transaction_date: '2026-09-25' },
  ],
});

function cash(id: string, amount: number, date: string, envelopeId = part(0)): CashSpend {
  return {
    id, member_id: 'm1', amount_ils: amount, category: 'סופר', note: null, spent_at: date,
    status: 'confirmed', confidence: 'high', input_kind: 'web', raw_input: null, transcript: null,
    telegram_update_id: null, telegram_chat_id: null, telegram_message_id: null, bot_message_id: null,
    envelope_id: envelopeId, envelope_type: 'trackingCategory', wallet_id: null, plan_id: null, created_at: `${date}T10:00:00Z`,
  };
}

function month(today: string | undefined, extra: { actuals?: ActualRow[]; spends?: CashSpend[]; overrides?: TrackerOverride[] } = {}) {
  return assembleMonth({
    month: OCT,
    envelopeRows,
    actualRows: [...actualRows, ...(extra.actuals ?? [])],
    spends: extra.spends ?? [],
    topups: [],
    plans: [],
    skippedPlanIds: new Set(),
    memberNames: new Map([['m1', 'יצחק']]),
    names,
    overrides: extra.overrides,
    today,
  });
}

const tracker = (today: string | undefined, extra?: Parameters<typeof month>[1]) =>
  month(today, extra).envelopes.find((e) => e.type === 'trackingCategory')!;

describe('a weekly tracker in the forecast, as RiseUp counts it (V2-18)', () => {
  it('counts past weeks at what was spent, this week and later ones at their plan', () => {
    const t = tracker('2026-10-15');
    expect(t.actual).toBe(543.53);
    expect(t.expected).toBe(2033.82);
  });

  it('keeps the week plans, one per part', () => {
    expect(tracker('2026-10-15').weekPlans).toEqual(PLANS);
  });

  it('moves on as the weeks pass', () => {
    // The 20th is in week 4: weeks 1–3 count what was spent.
    expect(tracker('2026-10-20').expected).toBe(Math.round((543.53 + 677.94 * 2) * 100) / 100);
  });

  it('counts a week at what was spent when that is more than its plan', () => {
    const t = tracker('2026-10-15', { actuals: [row(part(2), 't5', 300, '2026-10-16')] });
    expect(t.expected).toBe(Math.round((843.53 + 677.94 * 2) * 100) / 100);
  });

  it('counts cash spent in a week that is over', () => {
    const t = tracker('2026-10-15', { spends: [cash('c1', 45, '2026-10-02')] });
    expect(t.actual).toBe(588.53);
    expect(t.expected).toBe(Math.round((45 + 677.94 * 3) * 100) / 100);
  });

  it('a month that is over counts only what was spent; a month to come, every plan', () => {
    expect(tracker('2026-11-02').expected).toBe(543.53);
    expect(tracker('2026-09-30').expected).toBe(3050.73);
  });

  it('without a date, the plans’ sum as before', () => {
    expect(tracker(undefined).expected).toBe(3050.73);
  });

  it('a target of our own replaces the weekly plans', () => {
    const t = tracker('2026-10-15', {
      overrides: [{ trackerKey: 'v2-default-il-expense-category-2', month: '', name: null, targetIls: 2500, hidden: false, categoryLabel: null }],
    });
    expect(t.weekPlans).toBeUndefined();
    expect(t.expected).toBe(2500);
  });

  it('flows into the forecast', () => {
    const before = monthTotals(month(undefined).envelopes).forecast;
    const after = monthTotals(month('2026-10-15').envelopes).forecast;
    expect(Math.round((after - before) * 100) / 100).toBe(1016.91);
  });
});

describe('weeklyExpected', () => {
  it('maps part #k to week k + 1 and returns each week’s figure', () => {
    const actuals = month('2026-10-15').envelopes.find((e) => e.type === 'trackingCategory')!.actuals;
    const result = weeklyExpected({ weekPlans: PLANS, actuals, month: OCT, today: '2026-10-15' });
    expect(result.byWeek).toEqual([0, 0, 677.94, 677.94, 677.94]);
    expect(result.total).toBe(2033.82);
  });
});

describe('the weekly breakdown shows each week’s expected', () => {
  it('past weeks at what was spent, the rest at plan or spent', () => {
    const t = tracker('2026-10-15');
    const buckets = buildBuckets(t.type, t.actuals, { month: OCT, today: '2026-10-15', weekly: true, weekPlans: t.weekPlans });
    expect(buckets.map((b) => [b.label, b.actual, b.expected])).toEqual([
      ['שבוע 1', 0, 0],
      ['שבוע 2', 0, 0],
      ['שבוע 3', 543.53, 677.94],
      ['שבוע 4', 0, 677.94],
      ['שבוע 5', 0, 677.94],
    ]);
  });
});

describe('"איך חישבנו את הצפי?" (V2-18)', () => {
  const { envelopes } = month('2026-10-15');
  const b = forecastBreakdown(envelopes);

  it('still adds up to the forecast', () => {
    expect(b.forecast).toBe(monthTotals(envelopes).forecast);
  });

  it('names the weekly tracker counted by weeks, with its plans’ sum', () => {
    expect(b.weeklyTrackers).toEqual([{ title: 'סופר', planned: 3050.73, expected: 2033.82 }]);
  });

  it('lists the fixed charges not charged yet', () => {
    expect(b.fixedCharged).toBe(1821.85);
    expect(b.fixedUpcoming.map((u) => [u.businessName, u.amountIls])).toEqual([
      ['מי אביבים', 120.5],
      ['הולמס פלייס', 199],
    ]);
  });

  it('shows both in the sheet', () => {
    const html = renderToStaticMarkup(createElement(ForecastSheet, { open: true, onClose: () => {}, monthName: 'אוקטובר', breakdown: b }));
    expect(html).toContain('סופר');
    expect(html).toContain('שבועות שעברו');
    expect(html).toContain('2,034');
    expect(html).toContain('3,051');
    expect(html).toContain('חיובים קבועים שעוד לא ירדו');
    expect(html).toContain('מי אביבים');
    expect(html).toContain('הולמס פלייס');
  });
});
