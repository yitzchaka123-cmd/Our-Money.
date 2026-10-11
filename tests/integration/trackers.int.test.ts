import { beforeEach, describe, expect, it } from 'vitest';

import { SESSION_EXPIRED_MESSAGE } from '@/lib/auth/member';
import { addCashEntry } from '@/lib/cash/actions';
import { envelopeHistory } from '@/lib/dashboard/actions';
import { loadDashboard } from '@/lib/dashboard/data';
import {
  addCustomTracker,
  hideTracker,
  moveCashIncomesToMonth,
  renameTracker,
  setExpectedIncome,
  setTrackerTarget,
  trackableCategories,
} from '@/lib/dashboard/tracker-actions';
import { db } from '@/lib/db/client';

import { resetDb, seedMember, seedMonth, signIn, signOut, sql } from './helpers';

const SEP = '2026-09';
const OCT = '2026-10';
const KEY = 'v2-default-il-expense-category-13';
const carId = (month: string) => `${month}#trackingCategory#${KEY}#0`;

async function seedCar(month: string, spent: number): Promise<void> {
  const supabase = db();
  const { error } = await supabase
    .from('riseup_envelopes')
    .insert({ month, envelope_id: carId(month), envelope_type: 'trackingCategory', name: 'רכב', planned_ils: 2850, actual_ils: spent, position: 5 });
  if (error) throw new Error(error.message);
  const { error: actualError } = await supabase.from('riseup_envelope_actuals').insert([
    { month, envelope_id: carId(month), transaction_id: `${month}-fuel`, transaction_date: `${month}-06`, business_name: 'פז', amount_ils: spent, category_label: 'רכב' },
    { month, envelope_id: `${month}-var`, transaction_id: `${month}-pharm`, transaction_date: `${month}-07`, business_name: 'סופר פארם', amount_ils: 120, category_label: 'פארמה' },
  ]);
  if (actualError) throw new Error(actualError.message);
}

const car = (data: Awaited<ReturnType<typeof loadDashboard>>) => data.envelopes.find((e) => e.trackerKey === KEY);

let yitzchak: string;

beforeEach(async () => {
  resetDb();
  yitzchak = await seedMember(111, 'יצחק');
  for (const month of [SEP, OCT]) {
    await seedMonth(month);
    await seedCar(month, month === SEP ? 400 : 250);
  }
  signIn(yitzchak);
});

describe('tracker overrides against the real schema', () => {
  it('refuses without a session', async () => {
    signOut();
    expect(await setTrackerTarget(KEY, 100, OCT, false)).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
    expect(sql('select * from tracker_overrides')).toHaveLength(0);
  });

  it('keeps a new target from now on, or for one month only, without touching RiseUp rows', async () => {
    expect((await setTrackerTarget(KEY, 900, OCT, false)).ok).toBe(true);
    expect(car(await loadDashboard(OCT, yitzchak))).toMatchObject({ expected: 900, title: 'רכב' });
    expect(car(await loadDashboard(SEP, yitzchak))?.expected).toBe(900);

    expect((await setTrackerTarget(KEY, 500, OCT, true)).ok).toBe(true);
    const oct = car(await loadDashboard(OCT, yitzchak))!;
    expect(oct.expected).toBe(500);
    expect(oct.override).toMatchObject({ riseupTarget: 2850, retargeted: true, monthOnly: true });
    expect(car(await loadDashboard(SEP, yitzchak))?.expected).toBe(900);

    // Back to RiseUp's own target.
    expect((await setTrackerTarget(KEY, null, OCT, false)).ok).toBe(true);
    expect(car(await loadDashboard(OCT, yitzchak))?.expected).toBe(2850);

    // RiseUp's mirror is untouched throughout.
    expect(sql<{ planned_ils: number }>(`select planned_ils from riseup_envelopes where envelope_id like '%${KEY}%'`).map((r) => Number(r.planned_ils))).toEqual([2850, 2850]);
  });

  it('renames, and hides with the spending going back to variable expenses', async () => {
    await renameTracker(KEY, '  האוטו ');
    expect(car(await loadDashboard(OCT, yitzchak))?.title).toBe('האוטו');

    const before = await loadDashboard(OCT, yitzchak);
    const variableBefore = before.envelopes.find((e) => e.type === 'variable')!;
    await hideTracker(KEY);
    const after = await loadDashboard(OCT, yitzchak);
    expect(car(after)).toBeUndefined();
    expect(after.envelopes.find((e) => e.type === 'variable')!.actual).toBe(variableBefore.actual + 250);
    expect(after.forecast).toBe(before.forecast);
    expect(after.envelopeChoices.some((e) => e.envelopeId === carId(OCT))).toBe(false);

    const offered = await trackableCategories(OCT, []);
    expect(offered.ok && offered.data.hidden).toEqual([{ key: KEY, name: 'האוטו' }]);

    await hideTracker(KEY, false);
    expect(car(await loadDashboard(OCT, yitzchak))).toBeDefined();
  });

  it('adds a tracker of our own that collects card and cash spending with its label', async () => {
    expect((await addCustomTracker('פארמה', 450)).ok).toBe(true);
    expect((await addCashEntry({ kind: 'spend', amountIls: 30, category: 'פארמה', note: null, date: `${OCT}-08`, envelopeId: null, memberId: null, walletId: null })).ok).toBe(true);
    // The cash action filed it straight into our tracker.
    expect(sql<{ envelope_id: string }>('select envelope_id from cash_spends')[0]?.envelope_id).toBe('custom:פארמה');

    const data = await loadDashboard(OCT, yitzchak);
    const pharm = data.envelopes.find((e) => e.key === 'custom:פארמה')!;
    expect(pharm).toMatchObject({ type: 'trackingCategory', title: 'פארמה', expected: 450, actual: 150 });
    expect(pharm.override?.custom).toBe(true);
    expect(data.envelopeChoices.some((e) => e.envelopeId === 'custom:פארמה')).toBe(true);

    const offered = await trackableCategories(OCT, data.envelopes.filter((e) => e.type === 'trackingCategory').map((e) => e.title));
    expect(offered.ok).toBe(true);
    if (offered.ok) {
      const labels = offered.data.categories.map((c) => c.label);
      expect(labels).not.toContain('פארמה');
      expect(labels).not.toContain('רכב');
      expect(labels).toContain('מזון וצריכה');
    }
  });

  it('keeps our expected income for one month and counts it in the forecast', async () => {
    const before = await loadDashboard(OCT, yitzchak);
    expect((await setExpectedIncome(OCT, 14000)).ok).toBe(true);
    const after = await loadDashboard(OCT, yitzchak);
    expect(after.envelopes.find((e) => e.type === 'variableIncome')!.expected).toBe(14000);
    expect(after.forecast).toBe(before.forecast + 2000);
    expect((await loadDashboard(SEP, yitzchak)).envelopes.find((e) => e.type === 'variableIncome')!.expected).toBe(12000);
    await setExpectedIncome(OCT, null);
    expect((await loadDashboard(OCT, yitzchak)).forecast).toBe(before.forecast);
  });

  it('moves several cash incomes to another month together', async () => {
    const ids: string[] = [];
    for (const amount of [100, 200]) {
      const result = await addCashEntry({ kind: 'income', amountIls: amount, category: 'מתנה', note: null, date: `${OCT}-15`, envelopeId: null, memberId: null, walletId: null });
      if (result.ok) ids.push(result.id);
    }
    expect(ids).toHaveLength(2);
    expect(await moveCashIncomesToMonth([], SEP)).toEqual({ ok: false, error: 'לא נבחרו הכנסות.' });
    expect((await moveCashIncomesToMonth(ids, SEP)).ok).toBe(true);
    expect(sql<{ occurred_at: string }>('select occurred_at from cash_topups order by amount_ils').map((r) => r.occurred_at)).toEqual([`${SEP}-15`, `${SEP}-15`]);
    expect((await loadDashboard(SEP, yitzchak)).envelopes.find((e) => e.type === 'cashIncome')?.actual).toBe(300);
  });

  it('applies our target and name to a tracker RiseUp splits by the week, shown as one card', async () => {
    // A second week of the same tracker in October.
    const week2 = `${OCT}#trackingCategory#${KEY}#1`;
    await db().from('riseup_envelopes').insert({ month: OCT, envelope_id: week2, envelope_type: 'trackingCategory', name: 'רכב', planned_ils: 150, actual_ils: 80, position: 6 });
    await db().from('riseup_envelope_actuals').insert({ month: OCT, envelope_id: week2, transaction_id: `${OCT}-wash`, transaction_date: `${OCT}-12`, business_name: 'שטיפת רכב', amount_ils: 80, category_label: 'רכב' });

    const before = (await loadDashboard(OCT, yitzchak)).envelopes.filter((e) => e.trackerKey === KEY);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ actual: 330, expected: 3000, weekly: true });

    await renameTracker(KEY, 'האוטו');
    await setTrackerTarget(KEY, 1000, OCT, false);
    const after = (await loadDashboard(OCT, yitzchak)).envelopes.filter((e) => e.trackerKey === KEY);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ title: 'האוטו', actual: 330, expected: 1000, weekly: true });
    expect(after[0]!.override).toMatchObject({ riseupTarget: 3000, renamed: true, retargeted: true });

    const history = await envelopeHistory(OCT, 'trackingCategory', 'האוטו', 2, KEY, 'רכב');
    expect(history.ok && history.data.map((p) => [p.month, p.actual, p.expected])).toEqual([
      [SEP, 400, 1000],
      [OCT, 330, 1000],
    ]);
  });

  it("reads a tracker's months by its key, and falls back to transactions by label", async () => {
    await renameTracker(KEY, 'האוטו');
    await db().from('riseup_transactions').insert({ transaction_id: 'aug-fuel', cashflow_month: '2026-08', amount_ils: 610, is_income: false, category_label: 'רכב' });
    const result = await envelopeHistory(OCT, 'trackingCategory', 'האוטו', 3, KEY, 'רכב');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((p) => [p.month, p.actual, p.present])).toEqual([
      ['2026-08', 610, true],
      [SEP, 400, true],
      [OCT, 250, true],
    ]);
    expect(result.data[0]?.fromTransactions).toBe(true);
  });
});
