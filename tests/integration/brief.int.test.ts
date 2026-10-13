import { beforeEach, describe, expect, it } from 'vitest';

import { SESSION_EXPIRED_MESSAGE } from '@/lib/auth/member';
import { addCashEntry } from '@/lib/cash/actions';
import { finishBrief } from '@/lib/dashboard/brief-actions';
import { loadBrief } from '@/lib/dashboard/brief-load';
import { briefDraft } from '@/lib/dashboard/entry-drafts';
import { db } from '@/lib/db/client';

import { resetDb, seedMember, seedMonth, signIn, signOut, sql } from './helpers';

const MONTH = '2026-09';
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

async function mirror(id: string, firstSeen: string, extra: Record<string, unknown> = {}) {
  const { error } = await db().from('riseup_transactions').insert({
    transaction_id: id,
    transaction_date: `${MONTH}-05`,
    cashflow_month: MONTH,
    business_name: 'הראל ביטוח',
    amount_ils: 3500,
    is_income: false,
    category_label: 'ביטוח',
    account_number_hash: '7722',
    first_seen_at: firstSeen,
    ...extra,
  });
  if (error) throw new Error(error.message);
}

let yitzchak: string;
let sara: string;

beforeEach(async () => {
  resetDb();
  yitzchak = await seedMember(111, 'יצחק');
  sara = await seedMember(222, 'שרה');
  await seedMonth(MONTH);
  signIn(yitzchak);
});

describe('first_seen_at on the RiseUp mirror', () => {
  it('is set when a charge first arrives and left alone by every later sync', async () => {
    const row = { transaction_id: 'tx-1', transaction_date: '2026-09-05', business_name: 'שופרסל', amount_ils: 90, synced_at: hoursAgo(5) };
    // The sync's own write: an upsert that never mentions first_seen_at.
    await db().from('riseup_transactions').upsert([row], { onConflict: 'transaction_id' });
    const [first] = sql<{ first_seen_at: string }>("select first_seen_at from riseup_transactions where transaction_id = 'tx-1'");
    await new Promise((r) => setTimeout(r, 20));
    await db().from('riseup_transactions').upsert([{ ...row, synced_at: new Date().toISOString(), amount_ils: 95 }], { onConflict: 'transaction_id' });
    const [second] = sql<{ first_seen_at: string; amount_ils: number }>(
      "select first_seen_at, amount_ils from riseup_transactions where transaction_id = 'tx-1'",
    );
    expect(second).toEqual({ first_seen_at: first!.first_seen_at, amount_ils: 95 });
  });
});

describe('the daily brief', () => {
  it('starts a new member on the last day, and finishing it clears the count', async () => {
    await mirror(`${MONTH}-ins`, hoursAgo(1));
    await mirror(`${MONTH}-super`, hoursAgo(72), { business_name: 'שופרסל', amount_ils: 3000, category_label: null });
    await addCashEntry({ kind: 'spend', amountIls: 45, category: 'תחבורה', note: 'מונית', date: `${MONTH}-10`, envelopeId: null, memberId: sara, walletId: null });

    const brief = await loadBrief(yitzchak);
    expect(brief.count).toBe(2);
    expect(brief.items.map((i) => [i.key, i.label])).toEqual([
      [`riseup:${MONTH}-ins`, 'הוצאות קבועות · ביטוח'],
      [expect.stringMatching(/^cash-spend:/), 'מזומן · הוצאות משתנות · תחבורה'],
    ]);
    expect(brief.items[1]).toMatchObject({ memberName: 'שרה', account: 'מזומן · ארנק ראשי' });

    expect(await finishBrief(brief.asOf)).toEqual({ ok: true });
    expect((await loadBrief(yitzchak)).count).toBe(0);
    // Each member reads at their own pace.
    expect((await loadBrief(sara)).count).toBe(2);
  });

  it("names a partner's entry by her chosen name, and an edit keeps it hers", async () => {
    const { error } = await db().from('household_members').update({ preferred_name: 'שרי' }).eq('id', sara);
    if (error) throw new Error(error.message);
    await addCashEntry({ kind: 'spend', amountIls: 45, category: 'תחבורה', note: 'מונית', date: `${MONTH}-10`, envelopeId: null, memberId: sara, walletId: null });

    const item = (await loadBrief(yitzchak)).items.find((i) => i.kind === 'cash-spend')!;
    expect(item).toMatchObject({ memberName: 'שרי', memberId: sara });
    expect(item.actual.cash).toMatchObject({ memberName: 'שרי', memberId: sara });
    // Yitzchak is signed in and opens her entry: the draft still belongs to Sara.
    expect(briefDraft(item, yitzchak).memberId).toBe(sara);
  });

  it('keeps cash that needs review in the brief until it is confirmed', async () => {
    const { error } = await db().from('cash_spends').insert({
      member_id: sara, amount_ils: 30, category: 'אחר', spent_at: `${MONTH}-03`, status: 'needs_review', created_at: hoursAgo(200),
    });
    if (error) throw new Error(error.message);
    const brief = await loadBrief(yitzchak);
    expect(brief.items.map((i) => i.needsReview)).toEqual([true]);
    await finishBrief(brief.asOf);
    expect((await loadBrief(yitzchak)).count).toBe(1);
  });

  it('never moves the read point backwards or into the future, and needs a session', async () => {
    await finishBrief(new Date(Date.now() + 86_400_000).toISOString());
    const clamped = sql<{ seen_until: string }>('select seen_until from member_brief_state')[0]!.seen_until;
    expect(Date.parse(clamped)).toBeLessThanOrEqual(Date.now());

    await finishBrief(hoursAgo(48));
    expect(sql('select seen_until from member_brief_state')).toEqual([{ seen_until: clamped }]);

    signOut();
    expect(await finishBrief(new Date().toISOString())).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
  });
});
