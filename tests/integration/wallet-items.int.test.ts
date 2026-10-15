import { beforeEach, describe, expect, it } from 'vitest';

import { SESSION_EXPIRED_MESSAGE } from '@/lib/auth/member';
import { addCashEntry } from '@/lib/cash/actions';
import { assignWithdrawal } from '@/lib/cash/withdrawal-wallet';
import { assignWithdrawalToWallet } from '@/lib/cash/wallet-actions';
import { db } from '@/lib/db/client';

import { resetDb, seedMember, signIn, signOut, sql } from './helpers';

const MONTH = '2026-09';

async function newWallet(name: string, archived = false): Promise<string> {
  const { data, error } = await db().from('cash_wallets').insert({ name, position: 1, is_archived: archived }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function bankWithdrawal(amount: number): Promise<string> {
  const { data, error } = await db()
    .from('cash_topups')
    .insert({ amount_ils: amount, occurred_at: `${MONTH}-14`, source: 'riseup_withdrawal', riseup_transaction_id: `tx-${amount}`, business_name: 'משיכת מזומן' })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

let yitzchak: string;

beforeEach(async () => {
  resetDb();
  yitzchak = await seedMember(111, 'יצחק');
  signIn(yitzchak);
});

describe('which wallet a withdrawal went into (V2-06a)', () => {
  it('files a bank withdrawal into the chosen wallet (the bot calls this)', async () => {
    const test = await newWallet('Test');
    const id = await bankWithdrawal(500);
    signOut(); // the bot has no session cookie
    const result = await assignWithdrawal(id, test);
    expect(result).toEqual({ ok: true, id, walletName: 'Test' });
    expect(sql(`select wallet_id = '${test}' as moved from cash_topups where id = '${id}'`)).toEqual([{ moved: true }]);
  });

  it('files a hand-entered withdrawal too', async () => {
    const test = await newWallet('Test');
    const added = await addCashEntry({ kind: 'withdrawal', amountIls: 300, category: '', note: null, date: `${MONTH}-10`, envelopeId: null, memberId: null, walletId: null });
    if (!added.ok) throw new Error(added.error);
    expect((await assignWithdrawal(added.id, test)).ok).toBe(true);
    expect(sql(`select wallet_id = '${test}' as moved from cash_topups where id = '${added.id}'`)).toEqual([{ moved: true }]);
  });

  it('refuses cash income, an archived wallet, and unknown ids', async () => {
    const archived = await newWallet('ישן', true);
    const main = sql<{ id: string }>('select id from cash_wallets where is_default')[0]!.id;
    const income = await addCashEntry({ kind: 'income', amountIls: 200, category: 'מתנה', note: null, date: `${MONTH}-10`, envelopeId: null, memberId: null, walletId: null });
    if (!income.ok) throw new Error(income.error);
    expect((await assignWithdrawal(income.id, main)).ok).toBe(false);

    const id = await bankWithdrawal(400);
    expect((await assignWithdrawal(id, archived)).ok).toBe(false);
    expect((await assignWithdrawal(id, '00000000-0000-0000-0000-000000000000')).ok).toBe(false);
    expect((await assignWithdrawal('not-a-uuid', main)).ok).toBe(false);
  });

  it('the web action needs a signed-in member', async () => {
    const test = await newWallet('Test');
    const id = await bankWithdrawal(250);
    signOut();
    expect(await assignWithdrawalToWallet(id, test)).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
    signIn(yitzchak);
    expect((await assignWithdrawalToWallet(id, test)).ok).toBe(true);
  });
});
