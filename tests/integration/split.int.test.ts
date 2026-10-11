import { beforeEach, describe, expect, it } from 'vitest';

import { addCashEntry, splitCashEntry } from '@/lib/cash/actions';
import { splitParts } from '@/lib/cash/split';
import { loadDashboard } from '@/lib/dashboard/data';

import { resetDb, seedMember, seedMonth, signIn, sql } from './helpers';

const MONTH = '2026-10';
let member: string;

beforeEach(async () => {
  resetDb();
  member = await seedMember(111, 'יצחק');
  await seedMonth(MONTH);
  signIn(member);
});

describe('split, as the sheet sends it', () => {
  it('keeps what is left on the original row and files each part where it was sent', async () => {
    const added = await addCashEntry({ kind: 'spend', amountIls: 60, category: 'סופר', note: 'מכולת', date: `${MONTH}-01`, envelopeId: null, memberId: null, walletId: null });
    if (!added.ok) throw new Error(added.error);

    const parts = splitParts(
      60,
      [{ amountText: '25', envelopeId: `${MONTH}-food`, category: 'אוכל בחוץ' }],
      { envelopeId: `${MONTH}-var`, category: 'סופר', note: 'מכולת' },
      'מכולת',
    );
    expect((await splitCashEntry(added.id, 'spend', parts)).ok).toBe(true);

    const rows = sql<{ id: string; amount_ils: number; envelope_id: string; note: string }>(
      'select id, amount_ils, envelope_id, note from cash_spends order by amount_ils desc',
    );
    expect(rows.map((r) => [Number(r.amount_ils), r.envelope_id, r.note])).toEqual([
      [35, `${MONTH}-var`, 'מכולת'],
      [25, `${MONTH}-food`, 'מכולת'],
    ]);
    expect(rows[0]!.id).toBe(added.id);

    const data = await loadDashboard(MONTH, member);
    expect(data.envelopes.find((e) => e.envelopeId === `${MONTH}-food`)!.actual).toBe(100 + 25);
  });
});
