import { beforeEach, describe, expect, it } from 'vitest';

import { SESSION_EXPIRED_MESSAGE } from '@/lib/auth/member';
import { addCashEntry } from '@/lib/cash/actions';
import { assignWithdrawal } from '@/lib/cash/withdrawal-wallet';
import { setCashIncomeKind } from '@/lib/cash/income-actions';
import { addMoneyToWallet, assignWithdrawalToWallet, setCashInflowOverride } from '@/lib/cash/wallet-actions';
import { loadDashboard } from '@/lib/dashboard/data';
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
  // Ours alone; the shared reset does not know it.
  await db().from('cash_inflow_overrides').delete().neq('month', '');
  yitzchak = await seedMember(111, 'יצחק');
  signIn(yitzchak);
});

describe('cash income kind and category (V4-08)', () => {
  const income = (amount: number, date: string, category: string, incomeKind?: 'variable' | 'fixed' | 'non_cashflow') =>
    addCashEntry({ kind: 'income', amountIls: amount, category, note: null, date, envelopeId: null, memberId: null, walletId: null, incomeKind });
  const cashIncomeCard = async (month: string) => (await loadDashboard(month, yitzchak)).envelopes.find((e) => e.type === 'cashIncome');

  it('fixed income is expected next month until it arrives, then settles that expectation', async () => {
    const first = await income(2000, '2026-09-10', 'משכורת', 'fixed');
    if (!first.ok) throw new Error(first.error);
    expect(sql("select kind, recurrence, amount_ils, category, starts_month, day_of_month from cash_plans")).toEqual([
      { kind: 'income', recurrence: 'monthly', amount_ils: 2000, category: 'משכורת', starts_month: '2026-09', day_of_month: 10 },
    ]);
    // This month it is already in: nothing pending.
    expect((await cashIncomeCard('2026-09'))?.pending).toEqual([]);

    // Next month: expected, counted in the forecast, before anything arrives.
    const october = await loadDashboard('2026-10', yitzchak);
    const card = october.envelopes.find((e) => e.type === 'cashIncome');
    expect(card?.pending.map((p) => [p.category, p.amountIls, p.date])).toEqual([['משכורת', 2000, '2026-10-10']]);
    expect(card?.expected).toBe(2000);

    // It arrives (a little different): it settles the same expectation.
    const second = await income(2100, '2026-10-11', 'משכורת', 'fixed');
    if (!second.ok) throw new Error(second.error);
    expect(sql('select count(*)::int as n from cash_plans')).toEqual([{ n: 1 }]);
    const settled = await cashIncomeCard('2026-10');
    expect(settled?.pending).toEqual([]);
    expect(settled?.expected).toBe(2100);
  });

  it('switching a fixed income back to variable stops expecting it', async () => {
    const first = await income(2000, '2026-09-10', 'משכורת', 'fixed');
    if (!first.ok) throw new Error(first.error);
    expect((await setCashIncomeKind(first.id, 'variable', 'משכורת')).ok).toBe(true);
    expect((await cashIncomeCard('2026-10'))?.pending ?? []).toEqual([]);
    // And fixed again expects again.
    expect((await setCashIncomeKind(first.id, 'fixed', 'משכורת')).ok).toBe(true);
    expect((await cashIncomeCard('2026-10'))?.pending).toHaveLength(1);
  });

  it('"not cashflow" stays in the wallet but out of the cashflow and the forecast', async () => {
    const before = await loadDashboard(MONTH, yitzchak);
    const loan = await income(500, `${MONTH}-05`, 'החזר הלוואה', 'non_cashflow');
    if (!loan.ok) throw new Error(loan.error);
    const after = await loadDashboard(MONTH, yitzchak);
    expect(after.forecast).toBe(before.forecast);
    expect(after.envelopes.find((e) => e.type === 'cashIncome')?.actual ?? 0).toBe(0);
    expect(after.wallet.balance).toBe(before.wallet.balance + 500);
    expect(after.wallet.movements.find((m) => m.id === loan.id)?.incomeKind).toBe('non_cashflow');
  });

  it('remembers their own category names for next time', async () => {
    await income(300, `${MONTH}-03`, 'שיעורים פרטיים');
    const { wallet } = await loadDashboard(MONTH, yitzchak);
    expect(wallet.incomeCategories).toEqual(['משכורת', 'דיור', 'קצבאות', 'שיעורים פרטיים']);
  });

  it('money added to a wallet as fixed income is expected next month too', async () => {
    const main = sql<{ id: string }>('select id from cash_wallets where is_default')[0]!.id;
    const added = await addMoneyToWallet({ walletId: main, amountIls: 800, from: 'income', note: null, date: `${MONTH}-02`, incomeKind: 'fixed', category: 'קצבאות' });
    expect(added.ok).toBe(true);
    expect(sql("select category, income_kind, plan_id is not null as planned from cash_topups")).toEqual([{ category: 'קצבאות', income_kind: 'fixed', planned: true }]);
    expect((await cashIncomeCard('2026-10'))?.pending.map((p) => p.amountIls)).toEqual([800]);
  });

  it('setting the kind needs a session, a known kind, a category and a cash income', async () => {
    const one = await income(100, `${MONTH}-03`, 'מתנה');
    if (!one.ok) throw new Error(one.error);
    expect((await setCashIncomeKind(one.id, 'weird' as 'fixed', 'מתנה')).ok).toBe(false);
    expect((await setCashIncomeKind(one.id, 'fixed', '  ')).ok).toBe(false);
    const withdrawal = await addCashEntry({ kind: 'withdrawal', amountIls: 100, category: '', note: null, date: `${MONTH}-03`, envelopeId: null, memberId: null, walletId: null });
    if (!withdrawal.ok) throw new Error(withdrawal.error);
    expect((await setCashIncomeKind(withdrawal.id, 'fixed', 'מתנה')).ok).toBe(false);
    signOut();
    expect(await setCashIncomeKind(one.id, 'fixed', 'מתנה')).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
  });
});

describe('expected cash in this month (V2-12)', () => {
  const withdraw = (amount: number, date: string) =>
    addCashEntry({ kind: 'withdrawal', amountIls: amount, category: '', note: null, date, envelopeId: null, memberId: null, walletId: null });

  it('the dashboard guesses from the last three months, and our figure replaces the guess until removed', async () => {
    await withdraw(900, '2026-06-05');
    await withdraw(1200, '2026-07-05');
    await addCashEntry({ kind: 'income', amountIls: 300, category: 'מתנה', note: null, date: '2026-08-02', envelopeId: null, memberId: null, walletId: null });
    await withdraw(900, '2026-08-05');
    await withdraw(250, `${MONTH}-03`);

    const before = (await loadDashboard(MONTH, yitzchak)).wallet;
    // June, July, August: 900, 1200, and 300 income + 900 withdrawn.
    expect(before.inflow).toMatchObject({ predicted: 1100, override: null, arrived: 250 });
    expect(before.history?.map((h) => h.in)).toEqual([0, 900, 1200, 1200, 250]);

    expect((await setCashInflowOverride(MONTH, 2500)).ok).toBe(true);
    expect((await setCashInflowOverride(MONTH, 2600)).ok).toBe(true);
    expect(sql('select month, amount_ils from cash_inflow_overrides')).toEqual([{ month: MONTH, amount_ils: 2600 }]);
    expect((await loadDashboard(MONTH, yitzchak)).wallet.inflow).toMatchObject({ override: 2600, expected: 2600 });
    // Another month is untouched.
    expect((await loadDashboard('2026-10', yitzchak)).wallet.inflow?.override).toBeNull();

    expect((await setCashInflowOverride(MONTH, null)).ok).toBe(true);
    expect((await loadDashboard(MONTH, yitzchak)).wallet.inflow?.override).toBeNull();
  });

  it('needs a session, a real month and a sane amount', async () => {
    expect((await setCashInflowOverride('2026-9', 100)).ok).toBe(false);
    expect((await setCashInflowOverride(MONTH, -5)).ok).toBe(false);
    signOut();
    expect(await setCashInflowOverride(MONTH, 100)).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
  });
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
