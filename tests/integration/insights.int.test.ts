import { beforeEach, describe, expect, it } from 'vitest';

import { SESSION_EXPIRED_MESSAGE } from '@/lib/auth/member';
import { addCashEntry } from '@/lib/cash/actions';
import { loadDashboard } from '@/lib/dashboard/data';
import { dismissInsight, rateInsight, restoreInsight } from '@/lib/dashboard/insight-actions';
import { loadFeedback, loadInsights, recordForecast } from '@/lib/dashboard/insights-load';
import { db } from '@/lib/db/client';
import { isoDateInIsrael } from '@/lib/dates';

import { resetDb, seedMember, seedMonth, signIn, signOut, sql } from './helpers';

const MONTH = '2026-09';

let yitzchak: string;
let sara: string;

beforeEach(async () => {
  resetDb();
  await db().from('forecast_snapshots').delete().gte('day', '1900-01-01');
  yitzchak = await seedMember(111, 'יצחק');
  sara = await seedMember(222, 'שרה');
  await seedMonth(MONTH);
  signIn(yitzchak);
});

describe('insight cards', () => {
  it('stores a dismissal, its undo and a yes/no answer per member', async () => {
    expect(await dismissInsight('forecast:2026-10-11')).toEqual({ ok: true });
    expect(await rateInsight('tracker-over:2026-10:פארמה', false)).toEqual({ ok: true });
    let feedback = await loadFeedback(yitzchak);
    expect(feedback.get('forecast:2026-10-11')).toEqual({ dismissed: true, helpful: null });
    expect(feedback.get('tracker-over:2026-10:פארמה')).toEqual({ dismissed: false, helpful: false });

    await restoreInsight('forecast:2026-10-11');
    feedback = await loadFeedback(yitzchak);
    expect(feedback.get('forecast:2026-10-11')?.dismissed).toBe(false);
    expect((await loadFeedback(sara)).size).toBe(0);

    signOut();
    expect(await dismissInsight('x')).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
  });

  it('keeps one forecast a day and hands back yesterday’s', async () => {
    await db().from('forecast_snapshots').insert([
      { day: '2026-10-10', month: '2026-10', forecast: -9400 },
      { day: '2026-08-01', month: '2026-08', forecast: 100 },
    ]);
    expect(await recordForecast('2026-10', -10000, '2026-10-11')).toBe(-9400);
    expect(await recordForecast('2026-10', -10217, '2026-10-11')).toBe(-9400);
    expect(sql('select day, forecast from forecast_snapshots order by day')).toEqual([
      { day: '2026-10-10', forecast: -9400 },
      { day: '2026-10-11', forecast: -10217 },
    ]);
  });

  it('builds cards from the current month and drops a dismissed one for good', async () => {
    const month = isoDateInIsrael().slice(0, 7);
    await seedMonth(month);
    // The tracker's target is 600; this takes it past.
    await addCashEntry({ kind: 'spend', amountIls: 700, category: 'אוכל בחוץ', note: 'חתונה', date: `${month}-01`, envelopeId: `${month}-food`, memberId: null, walletId: null });

    const data = await loadDashboard(month, yitzchak);
    const key = `tracker-over:${month}:אוכל בחוץ`;
    expect((await loadInsights(data, yitzchak)).map((i) => i.key)).toContain(key);

    await dismissInsight(key);
    expect((await loadInsights(data, yitzchak)).map((i) => i.key)).not.toContain(key);
    expect((await loadInsights(data, sara)).map((i) => i.key)).toContain(key);
    // An old month gets no cards.
    expect(await loadInsights(await loadDashboard(MONTH, yitzchak), yitzchak)).toEqual([]);
  });
});
