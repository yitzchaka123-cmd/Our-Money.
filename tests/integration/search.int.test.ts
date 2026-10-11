import { beforeEach, describe, expect, it } from 'vitest';

import { addCashEntry } from '@/lib/cash/actions';
import { setWalletBalance } from '@/lib/cash/wallet-actions';
import { searchTransactions, type SearchHit } from '@/lib/dashboard/actions';
import { renameTracker } from '@/lib/dashboard/tracker-actions';
import { db } from '@/lib/db/client';

import { resetDb, seedMember, seedMonth, signIn, signOut, sql } from './helpers';

const SEP = '2026-09';
const OCT = '2026-10';

function spend(amountIls: number, note: string, date: string, category = 'סופר') {
  return addCashEntry({ kind: 'spend', amountIls, category, note, date, envelopeId: null, memberId: null, walletId: null });
}

beforeEach(async () => {
  resetDb();
  signIn(await seedMember(111, 'יצחק'));
  await seedMonth(SEP);
  await seedMonth(OCT);
});

describe('search across all months', () => {
  it('needs a session and a query', async () => {
    signOut();
    expect((await searchTransactions('שופרסל')).ok).toBe(false);
    signIn(await seedMember(222, 'שרה'));
    expect(await searchTransactions('   ')).toEqual({ ok: true, data: { hits: [], next: null } });
  });

  it('finds RiseUp charges and cash together, in every month, by name, category and amount', async () => {
    await spend(42, 'שופרסל בשכונה', `${OCT}-15`);
    await addCashEntry({ kind: 'income', amountIls: 300, category: 'מתנה', note: 'מסבתא', date: `${SEP}-03`, envelopeId: null, memberId: null, walletId: null });

    const byName = await searchTransactions('שופרסל');
    if (!byName.ok) throw new Error(byName.error);
    expect(byName.data.hits.map((h) => `${h.source}:${h.month}`)).toEqual(['cash:2026-10', 'card:2026-10', 'card:2026-09']);
    const card = byName.data.hits.find((h) => h.source === 'card')!;
    // Enough to open the transaction sheet in the right colour.
    expect(card).toMatchObject({ envelopeType: 'variable', envelopeTitle: 'הוצאות משתנות', title: 'שופרסל' });
    expect(card.actual).toMatchObject({ businessName: 'שופרסל', amountIls: 3000 });

    const byAmount = await searchTransactions('42');
    if (!byAmount.ok) throw new Error(byAmount.error);
    expect(byAmount.data.hits.map((h) => h.title)).toEqual(['שופרסל בשכונה']);

    const byCategory = await searchTransactions('ביטוח');
    if (!byCategory.ok) throw new Error(byCategory.error);
    expect(byCategory.data.hits.map((h) => h.envelopeType)).toEqual(['fixed', 'fixed']);

    const income = await searchTransactions('סבתא');
    if (!income.ok) throw new Error(income.error);
    expect(income.data.hits[0]).toMatchObject({ kind: 'income', envelopeType: 'cashIncome', month: SEP });
    expect(income.data.hits[0]!.actual.cash).toMatchObject({ kind: 'income' });
  });

  it('pages 30 at a time, newest first, with nothing repeated or skipped', async () => {
    for (let day = 1; day <= 20; day += 1) {
      await spend(10 + day, 'קפה', `${OCT}-${String(day).padStart(2, '0')}`);
      await spend(100 + day, 'קפה', `${SEP}-${String(day).padStart(2, '0')}`);
    }
    await db().from('riseup_envelope_actuals').insert(
      [1, 2, 3].map((n) => ({
        month: SEP,
        envelope_id: `${SEP}-var`,
        transaction_id: `coffee-${n}`,
        transaction_date: `${SEP}-2${n}`,
        business_name: 'קפה ארומה',
        amount_ils: 20 + n,
      })),
    );

    const seen: SearchHit[] = [];
    let page = await searchTransactions('קפה');
    let pages = 0;
    while (true) {
      if (!page.ok) throw new Error(page.error);
      pages += 1;
      expect(page.data.hits.length).toBeLessThanOrEqual(30);
      seen.push(...page.data.hits);
      if (!page.data.next) break;
      page = await searchTransactions('קפה', page.data.next);
    }

    expect(pages).toBe(2);
    expect(seen).toHaveLength(43);
    expect(new Set(seen.map((h) => h.key)).size).toBe(43);
    const dates = seen.map((h) => h.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(seen.filter((h) => h.source === 'card')).toHaveLength(3);
  });

  it('never shows a wallet balance adjustment, only real entries', async () => {
    await addCashEntry({ kind: 'withdrawal', amountIls: 300, category: '', note: 'יתרה מהבנק', date: `${OCT}-02`, envelopeId: null, memberId: null, walletId: null });
    const [wallet] = sql<{ id: string }>('select id from cash_wallets where is_default');
    // Stored as an 'adjustment' top-up with the note "עדכון יתרה".
    expect((await setWalletBalance(wallet!.id, 250, `${OCT}-03`)).ok).toBe(true);
    expect(sql("select count(*)::int as n from cash_topups where source = 'adjustment'")).toEqual([{ n: 1 }]);

    const result = await searchTransactions('יתרה');
    if (!result.ok) throw new Error(result.error);
    expect(result.data.hits.map((h) => h.title)).toEqual(['יתרה מהבנק']);
  });

  it('names a tracker as the dashboard does: our own name first, never a raw id', async () => {
    const key = 'v2-default-il-expense-category-13';
    const carId = `${OCT}#trackingCategory#${key}#0`;
    await db()
      .from('riseup_envelopes')
      .insert({ month: OCT, envelope_id: carId, envelope_type: 'trackingCategory', name: carId, planned_ils: 2850, actual_ils: 250, position: 5 });
    await db().from('riseup_envelope_actuals').insert({
      month: OCT,
      envelope_id: carId,
      transaction_id: `${OCT}-fuel`,
      transaction_date: `${OCT}-06`,
      business_name: 'פז',
      amount_ils: 250,
      category_label: 'רכב',
    });

    const named = await searchTransactions('פז');
    if (!named.ok) throw new Error(named.error);
    expect(named.data.hits[0]).toMatchObject({ envelopeType: 'trackingCategory', envelopeTitle: 'רכב' });

    expect((await renameTracker(key, 'האוטו')).ok).toBe(true);
    const renamed = await searchTransactions('פז');
    if (!renamed.ok) throw new Error(renamed.error);
    expect(renamed.data.hits[0]).toMatchObject({ envelopeTitle: 'האוטו' });
  });

  it('treats filter syntax in a query as plain text', async () => {
    expect((await searchTransactions('a,b.eq.1)')).ok).toBe(true);
    expect((await searchTransactions('קפה', { card: -1, spend: 0, topup: 0 })).ok).toBe(false);
  });
});
