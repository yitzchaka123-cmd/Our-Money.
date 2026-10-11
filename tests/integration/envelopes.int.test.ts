import { beforeEach, describe, expect, it } from 'vitest';

import { loadDashboard } from '@/lib/dashboard/data';
import { db } from '@/lib/db/client';

import { resetDb, seedMember, signIn } from './helpers';

/**
 * Two months stored the way the real sync stored them before names were
 * fixed: real RiseUp ids with `#`, one envelope per fixed charge, trackers
 * named by their raw id, a grocery tracker split into weekly parts.
 */
const SEP = '2026-09';
const OCT = '2026-10';
const tracker = (month: string, key: string) => `${month}#trackingCategory#${key}`;
const fixed = (month: string, key: string) => `${month}#fixed#${key}`;

async function seedRealMonths(): Promise<void> {
  const envelopes = [
    // September: names were learned from that month's own transactions.
    { month: SEP, envelope_id: tracker(SEP, 'v2-62d56b95339d9f7b44308a3c'), envelope_type: 'trackingCategory', name: tracker(SEP, 'v2-62d56b95339d9f7b44308a3c'), planned_ils: 0, actual_ils: 40, position: 0 },
    { month: SEP, envelope_id: fixed(SEP, 'aaa'), envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 55, actual_ils: 55, position: 1 },
    // October.
    { month: OCT, envelope_id: fixed(OCT, 'aaa'), envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 55, actual_ils: 0, position: 0 },
    { month: OCT, envelope_id: fixed(OCT, 'bbb'), envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 1842.36, actual_ils: 1821.85, position: 1 },
    { month: OCT, envelope_id: fixed(OCT, 'ccc'), envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 114, actual_ils: 114, position: 2 },
    { month: OCT, envelope_id: fixed(OCT, 'ddd'), envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 0, actual_ils: 0, position: 3 },
    { month: OCT, envelope_id: tracker(OCT, 'v2-default-il-expense-category-13'), envelope_type: 'trackingCategory', name: tracker(OCT, 'v2-default-il-expense-category-13'), planned_ils: 0, actual_ils: 0, position: 4 },
    { month: OCT, envelope_id: tracker(OCT, 'v2-62d56b95339d9f7b44308a3c'), envelope_type: 'trackingCategory', name: tracker(OCT, 'v2-62d56b95339d9f7b44308a3c'), planned_ils: 0, actual_ils: 0, position: 5 },
    { month: OCT, envelope_id: tracker(OCT, 'v2-62d571eb339d9fa51c3091c6'), envelope_type: 'trackingCategory', name: tracker(OCT, 'v2-62d571eb339d9fa51c3091c6'), planned_ils: 0, actual_ils: 0, position: 6 },
    { month: OCT, envelope_id: `${tracker(OCT, 'v2-default-il-expense-category-2')}#0`, envelope_type: 'trackingCategory', name: `${tracker(OCT, 'v2-default-il-expense-category-2')}#0`, planned_ils: 0, actual_ils: 30, position: 7 },
    { month: OCT, envelope_id: `${tracker(OCT, 'v2-default-il-expense-category-2')}#1`, envelope_type: 'trackingCategory', name: `${tracker(OCT, 'v2-default-il-expense-category-2')}#1`, planned_ils: 0, actual_ils: 20, position: 8 },
    { month: OCT, envelope_id: `${OCT}#variableIncome`, envelope_type: 'variableIncome', name: 'הכנסות', planned_ils: 0, actual_ils: 7635, position: 9 },
    { month: OCT, envelope_id: `${OCT}#variable`, envelope_type: 'variable', name: 'הוצאות משתנות', planned_ils: 0, actual_ils: 124.32, position: 10 },
    { month: OCT, envelope_id: `${OCT}#riseupGoal`, envelope_type: 'riseupGoal', name: 'הפקדות לחיסכון', planned_ils: 0, actual_ils: 0, position: 11 },
  ];
  const { error } = await db().from('riseup_envelopes').insert(envelopes);
  if (error) throw new Error(error.message);

  const actual = (month: string, envelopeId: string, id: string, amount: number, name: string, label: string | null, date: string, isIncome = false) => ({
    month,
    envelope_id: envelopeId,
    transaction_id: id,
    transaction_date: date,
    billing_date: date,
    business_name: name,
    amount_ils: amount,
    is_income: isIncome,
    category_label: label,
  });
  const { error: actualsError } = await db().from('riseup_envelope_actuals').insert([
    actual(SEP, tracker(SEP, 'v2-62d56b95339d9f7b44308a3c'), 's-hobby', 40, 'מתנ"ס', 'חוגים', '2026-09-10'),
    actual(SEP, fixed(SEP, 'aaa'), 's-riseup', 55, 'רייזאפ', 'RiseUp', '2026-09-12'),
    actual(OCT, fixed(OCT, 'bbb'), 'o-loan', 1821.85, 'בנק לאומי', 'הלוואה', '2026-10-02'),
    actual(OCT, fixed(OCT, 'ccc'), 'o-phone', 114, 'פרטנר', 'תשלומים', '2026-10-03'),
    actual(OCT, `${tracker(OCT, 'v2-default-il-expense-category-2')}#0`, 'o-super1', 30, 'שופרסל', 'כלכלה', '2026-10-02'),
    actual(OCT, `${tracker(OCT, 'v2-default-il-expense-category-2')}#1`, 'o-super2', 20, 'רמי לוי', 'כלכלה', '2026-10-06'),
    actual(OCT, `${OCT}#variableIncome`, 'o-salary', 7635, 'משכורת', null, '2026-10-01', true),
    actual(OCT, `${OCT}#variable`, 'o-var', 124.32, 'ארומה', null, '2026-10-05'),
  ]);
  if (actualsError) throw new Error(actualsError.message);
}

beforeEach(async () => {
  resetDb();
  signIn(await seedMember(111, 'יצחק'));
  await seedRealMonths();
});

describe('tracker names on the dashboard', () => {
  it('names every tracker, never showing a raw id', async () => {
    const data = await loadDashboard(OCT);
    const titles = data.envelopes.filter((e) => e.type === 'trackingCategory').map((e) => e.title);

    expect(titles).toContain('רכב'); // built-in list
    expect(titles).toContain('חוגים'); // learned from September's transactions
    expect(titles).toContain('קטגוריה למעקב'); // a custom tracker nobody has named yet
    expect(titles).toContain('כלכלה'); // its own transactions
    expect(titles.some((t) => t.includes('#'))).toBe(false);
  });

  it('offers the named trackers in the cash pickers', async () => {
    const data = await loadDashboard(OCT);
    const names = data.envelopeChoices.map((e) => e.name);
    expect(names).toContain('רכב');
    expect(names.some((n) => n.includes('#'))).toBe(false);
  });
});
