import { beforeEach, describe, expect, it } from 'vitest';

import { envelopeRefsForMonth } from '@/lib/db/queries';
import { searchTransactions } from '@/lib/dashboard/actions';
import { loadDashboard } from '@/lib/dashboard/data';
import { forecastBreakdown } from '@/lib/dashboard/forecast-breakdown';
import { db } from '@/lib/db/client';

import { resetDb, seedMember, signIn } from './helpers';

/**
 * V2-19, stored the way the sync stores the live data: the salary, marked
 * "fixed income" in RiseUp, arrives as one more `fixed` envelope with an
 * income actual; the variable income envelope is empty. November is synced
 * before its salary came in.
 */
const OCT = '2026-10';
const NOV = '2026-11';
const SALARY = 'c6b3e219-c39f-11f1-b563-8dcdf033ade8';
const fixed = (month: string, key: string) => `${month}#fixed#${key}`;

async function seed(): Promise<void> {
  const envelopes = [OCT, NOV].flatMap((month) => [
    { month, envelope_id: fixed(month, 'loan'), envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 1842.36, actual_ils: 0, position: 0 },
    { month, envelope_id: fixed(month, SALARY), envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 7635, actual_ils: 0, position: 1 },
    { month, envelope_id: `${month}#variableIncome`, envelope_type: 'variableIncome', name: 'הכנסות', planned_ils: 0, actual_ils: 0, position: 2 },
    { month, envelope_id: `${month}#variable`, envelope_type: 'variable', name: 'הוצאות משתנות', planned_ils: 0, actual_ils: 0, position: 3 },
  ]);
  const { error } = await db().from('riseup_envelopes').insert(envelopes);
  if (error) throw new Error(error.message);

  const actual = (envelopeId: string, id: string, amount: number, name: string, label: string, date: string, isIncome: boolean) => ({
    month: OCT,
    envelope_id: envelopeId,
    transaction_id: id,
    transaction_date: date,
    billing_date: date,
    business_name: name,
    amount_ils: amount,
    is_income: isIncome,
    category_label: label,
    source: isIncome ? 'leumiBank' : 'leumicard',
    account_number_hash: isIncome ? 'c81bcf' : 'cc5910',
  });
  const { error: actualsError } = await db().from('riseup_envelope_actuals').insert([
    actual(fixed(OCT, 'loan'), 'o-loan', 1821.85, 'בנק לאומי', 'הלוואה', '2026-10-02', false),
    actual(fixed(OCT, SALARY), 'o-salary', 7635, 'העברת משכורת', 'משכורת', '2026-10-08', true),
  ]);
  if (actualsError) throw new Error(actualsError.message);
}

beforeEach(async () => {
  resetDb();
  signIn(await seedMember(111, 'יצחק'));
  await seed();
});

describe('fixed income (V2-19)', () => {
  it('shows the salary as income, never as a fixed expense', async () => {
    const data = await loadDashboard(OCT);
    const income = data.envelopes.find((e) => e.type === 'fixedIncome');
    expect(income).toMatchObject({ title: 'הכנסות קבועות', actual: 7635, expected: 7635 });
    const fixedCard = data.envelopes.find((e) => e.type === 'fixed')!;
    expect(fixedCard.actual).toBe(1821.85);
    expect(fixedCard.expected).toBe(1842.36);
    expect(data.totalExpectedExpenses).toBe(1842.36);
    expect(data.forecast).toBe(Math.round((7635 - 1842.36) * 100) / 100);
    expect(forecastBreakdown(data.envelopes).forecast).toBe(data.forecast);
  });

  it('expects it next month too, from what came in this month', async () => {
    const data = await loadDashboard(NOV);
    const income = data.envelopes.find((e) => e.type === 'fixedIncome')!;
    expect(income).toMatchObject({ actual: 0, expected: 7635 });
    expect(income.upcoming?.[0]).toMatchObject({ amountIls: 7635, categoryLabel: 'משכורת', businessName: 'העברת משכורת' });
    expect(data.forecast).toBe(Math.round((7635 - 1842.36) * 100) / 100);
  });

  it('is labelled as income in search', async () => {
    const result = await searchTransactions('משכורת');
    if (!result.ok) throw new Error(result.error);
    expect(result.data.hits[0]).toMatchObject({ kind: 'income', envelopeType: 'fixedIncome', envelopeTitle: 'הכנסות קבועות' });
  });

  it('keeps "משכורת" out of the labels that file a cash spend', async () => {
    const refs = await envelopeRefsForMonth(OCT);
    expect(refs.flatMap((r) => r.categoryLabels ?? [])).not.toContain('משכורת');
  });
});
