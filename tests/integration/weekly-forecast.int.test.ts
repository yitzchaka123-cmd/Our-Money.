import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadDashboard } from '@/lib/dashboard/data';
import { forecastBreakdown } from '@/lib/dashboard/forecast-breakdown';
import { db } from '@/lib/db/client';

import { resetDb, seedMember, signIn } from './helpers';

/**
 * V2-18, stored as the sync stores it: the weekly supermarket tracker of
 * October 2026 (five parts, 338.97 then 677.94 × 4; 543.53 spent on the
 * 15th, in week 3) and one fixed charge not charged yet. Seen on the 15th,
 * weeks 1 and 2 are over and count what was spent in them: nothing.
 */
const OCT = '2026-10';
const part = (k: number) => `${OCT}#trackingCategory#v2-default-il-expense-category-2#${k}`;
const PLANS = [338.97, 677.94, 677.94, 677.94, 677.94];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T18:00:00Z'));
  resetDb();
  signIn(await seedMember(111, 'יצחק'));
  const { error } = await db().from('riseup_envelopes').insert([
    ...PLANS.map((planned, k) => ({ month: OCT, envelope_id: part(k), envelope_type: 'trackingCategory', name: 'סופר', planned_ils: planned, actual_ils: 0, position: k })),
    { month: OCT, envelope_id: `${OCT}#fixed#water`, envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 120.5, actual_ils: 0, position: 5 },
    { month: OCT, envelope_id: `${OCT}#variableIncome`, envelope_type: 'variableIncome', name: 'הכנסות', planned_ils: 7635, actual_ils: 0, position: 6 },
    { month: OCT, envelope_id: `${OCT}#variable`, envelope_type: 'variable', name: 'הוצאות משתנות', planned_ils: 0, actual_ils: 0, position: 7 },
  ]);
  if (error) throw new Error(error.message);
  const { error: actualsError } = await db().from('riseup_envelope_actuals').insert(
    [60, 19.98, 15, 448.55].map((amount, i) => ({
      month: OCT,
      envelope_id: part(2),
      transaction_id: `super-${i}`,
      transaction_date: '2026-10-15',
      billing_date: '2026-10-15',
      business_name: 'שופרסל',
      amount_ils: amount,
      is_income: false,
      category_label: 'כלכלה',
    })),
  );
  if (actualsError) throw new Error(actualsError.message);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the weekly tracker in the forecast (V2-18)', () => {
  it('counts weeks that are over at what was spent, as RiseUp does', async () => {
    const data = await loadDashboard(OCT);
    const tracker = data.envelopes.find((e) => e.type === 'trackingCategory')!;
    expect(tracker).toMatchObject({ actual: 543.53, expected: 2033.82, weekPlans: PLANS });
    expect(data.forecast).toBe(Math.round((7635 - 2033.82 - 120.5) * 100) / 100);
  });

  it('explains it, and lists the fixed charge still to come, in the forecast sheet', async () => {
    const data = await loadDashboard(OCT);
    const b = forecastBreakdown(data.envelopes);
    expect(b.forecast).toBe(data.forecast);
    expect(b.weeklyTrackers).toEqual([{ title: 'סופר', planned: 3050.73, expected: 2033.82 }]);
    expect(b.fixedUpcoming.map((u) => u.amountIls)).toEqual([120.5]);
  });
});
