import { beforeEach, describe, expect, it } from 'vitest';

import { searchTransactions } from '@/lib/dashboard/actions';
import { loadDashboard } from '@/lib/dashboard/data';
import { saveTransactionNote } from '@/lib/dashboard/note-actions';

import { resetDb, seedMember, seedMonth, signIn, signOut, sql } from './helpers';

const OCT = '2026-10';
const SCHNITZEL = `${OCT}-rest`;

let memberId: string;

beforeEach(async () => {
  resetDb();
  memberId = await seedMember(111, 'יצחק');
  signIn(memberId);
  await seedMonth(OCT);
});

function charge(data: Awaited<ReturnType<typeof loadDashboard>>, transactionId: string) {
  return data.envelopes.flatMap((e) => e.actuals).find((a) => a.transactionId === transactionId);
}

describe('our own note on a RiseUp charge (V2-16)', () => {
  it('needs a session, a charge and a short note', async () => {
    signOut();
    expect((await saveTransactionNote(SCHNITZEL, OCT, 'שניצל')).ok).toBe(false);
    signIn(memberId);
    expect((await saveTransactionNote('', OCT, 'שניצל')).ok).toBe(false);
    expect((await saveTransactionNote(SCHNITZEL, 'October', 'שניצל')).ok).toBe(false);
    expect((await saveTransactionNote(SCHNITZEL, OCT, 'א'.repeat(301))).ok).toBe(false);
    expect(sql('select * from transaction_notes')).toEqual([]);
  });

  it('is kept on our side, shown on the charge, and RiseUp’s rows stay as they were', async () => {
    const before = sql(`select business_name from riseup_envelope_actuals where transaction_id = '${SCHNITZEL}'`);
    expect(await saveTransactionNote(SCHNITZEL, OCT, '  שניצל אתמול בערב  ')).toEqual({ ok: true });

    expect(sql('select transaction_id, month, note, updated_by from transaction_notes')).toEqual([
      { transaction_id: SCHNITZEL, month: OCT, note: 'שניצל אתמול בערב', updated_by: memberId },
    ]);
    expect(sql(`select business_name from riseup_envelope_actuals where transaction_id = '${SCHNITZEL}'`)).toEqual(before);

    const data = await loadDashboard(OCT, memberId);
    expect(charge(data, SCHNITZEL)).toMatchObject({ businessName: 'מסעדת הגליל', note: 'שניצל אתמול בערב' });
    expect(charge(data, `${OCT}-super`)?.note ?? null).toBeNull();
  });

  it('can be changed and cleared', async () => {
    await saveTransactionNote(SCHNITZEL, OCT, 'שניצל');
    await saveTransactionNote(SCHNITZEL, OCT, 'שניצל עם צ׳יפס');
    expect(sql('select note from transaction_notes')).toEqual([{ note: 'שניצל עם צ׳יפס' }]);

    expect(await saveTransactionNote(SCHNITZEL, OCT, '   ')).toEqual({ ok: true });
    expect(sql('select * from transaction_notes')).toEqual([]);
    expect(charge(await loadDashboard(OCT, memberId), SCHNITZEL)?.note ?? null).toBeNull();
  });

  it('is searchable, and search results carry it', async () => {
    await saveTransactionNote(SCHNITZEL, OCT, 'שניצל');

    const byNote = await searchTransactions('שניצל');
    if (!byNote.ok) throw new Error(byNote.error);
    expect(byNote.data.hits.map((h) => h.id)).toEqual([SCHNITZEL]);
    expect(byNote.data.hits[0]).toMatchObject({ source: 'card', title: 'מסעדת הגליל', note: 'שניצל' });
    expect(byNote.data.hits[0]!.actual.note).toBe('שניצל');

    // Found by its business name, it still shows the note.
    const byName = await searchTransactions('הגליל');
    if (!byName.ok) throw new Error(byName.error);
    expect(byName.data.hits[0]).toMatchObject({ id: SCHNITZEL, note: 'שניצל' });

    // Nothing else matches the note's words.
    const none = await searchTransactions('פיצה');
    if (!none.ok) throw new Error(none.error);
    expect(none.data.hits).toEqual([]);
  });
});
