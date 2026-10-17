import { beforeEach, describe, expect, it } from 'vitest';

import { confirmCashSpends } from '@/lib/cash/actions';
import { loadBrief } from '@/lib/dashboard/brief-load';
import { loadDashboard } from '@/lib/dashboard/data';
import { db } from '@/lib/db/client';
import { spendsBetween } from '@/lib/db/queries';

import { resetDb, seedMember, seedMonth, signIn, sql } from './helpers';

/**
 * C32: a cash entry waiting for "✅ לאשר" (the bot's ask-first mode, or an
 * entry the AI was unsure about) is shown but counted nowhere until it is
 * approved — and approving it from the app makes it count.
 */

const MONTH = '2026-09';

let yitzchak: string;

beforeEach(async () => {
  resetDb();
  yitzchak = await seedMember(111, 'יצחק');
  await seedMonth(MONTH);
  signIn(yitzchak);
  const { error } = await db()
    .from('cash_topups')
    .insert({ amount_ils: 500, occurred_at: `${MONTH}-01`, source: 'manual', note: 'משיכה' });
  if (error) throw new Error(error.message);
});

async function waitingSpend(): Promise<string> {
  const { data, error } = await db()
    .from('cash_spends')
    .insert({
      member_id: yitzchak, amount_ils: 120, category: 'סופר', note: 'מכולת', spent_at: `${MONTH}-10`,
      status: 'needs_review', confidence: 'high', input_kind: 'text',
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

describe('an entry waiting for approval', () => {
  it('shows, but counts nowhere until "לאשר" — then it counts everywhere', async () => {
    const before = await loadDashboard(MONTH, yitzchak);
    const id = await waitingSpend();

    const waiting = await loadDashboard(MONTH, yitzchak);
    const variable = waiting.envelopes.find((e) => e.type === 'variable')!;
    // Visible: in its envelope (set aside) and among the wallet's movements.
    expect(variable.awaiting?.map((a) => a.cash?.id)).toEqual([id]);
    expect(waiting.wallet.movements.find((m) => m.id === id)).toMatchObject({ awaiting: true });
    // Not counted: the envelope, the totals, the forecast, the wallet.
    expect(variable.actual).toBe(before.envelopes.find((e) => e.type === 'variable')!.actual);
    expect(waiting.forecast).toBe(before.forecast);
    expect(waiting.totalActualExpenses).toBe(before.totalActualExpenses);
    expect(waiting.totalExpectedExpenses).toBe(before.totalExpectedExpenses);
    expect(waiting.variableRemaining).toBe(before.variableRemaining);
    expect(waiting.wallet.balance).toBe(500);
    expect(waiting.wallet.spent).toBe(0);
    expect(waiting.wallet.history?.at(-1)).toMatchObject({ month: MONTH, out: 0 });
    expect(waiting.briefCount).toBe(1);
    // The bot's day and month totals read the same approved rows.
    expect(await spendsBetween(`${MONTH}-01`, `${MONTH}-30`)).toEqual([]);

    // The brief still offers it for approval, filed in its envelope.
    const item = (await loadBrief(yitzchak)).items.find((i) => i.kind === 'cash-spend')!;
    expect(item).toMatchObject({ needsReview: true, envelopeType: 'variable' });

    // "✅ לאשר" from the app: the bot's approval.
    expect(await confirmCashSpends([id])).toMatchObject({ ok: true });
    expect(sql('select status, confidence from cash_spends')).toEqual([{ status: 'confirmed', confidence: 'high' }]);

    const approved = await loadDashboard(MONTH, yitzchak);
    const counted = approved.envelopes.find((e) => e.type === 'variable')!;
    expect(counted.awaiting ?? []).toEqual([]);
    expect(counted.actual).toBe(variable.actual + 120);
    expect(approved.totalActualExpenses).toBe(before.totalActualExpenses + 120);
    expect(approved.wallet.balance).toBe(380);
    expect(approved.wallet.spent).toBe(120);
    expect(approved.wallet.movements.find((m) => m.id === id)?.awaiting).toBeFalsy();
    expect(approved.briefCount).toBe(0);
    expect(await spendsBetween(`${MONTH}-01`, `${MONTH}-30`)).toHaveLength(1);
  });
});
