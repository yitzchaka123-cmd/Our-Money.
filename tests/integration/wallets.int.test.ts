import { beforeEach, describe, expect, it } from 'vitest';

import { SESSION_EXPIRED_MESSAGE } from '@/lib/auth/member';
import { addCashEntry, deleteCashEntry, transferBetweenWallets, type CashEntryInput } from '@/lib/cash/actions';
import { addMoneyToWallet, deleteWallet, setWalletBalance } from '@/lib/cash/wallet-actions';
import { loadDashboard } from '@/lib/dashboard/data';
import { db } from '@/lib/db/client';

import { resetDb, seedMember, signIn, signOut, sql } from './helpers';

const MONTH = '2026-09';
const DAY = `${MONTH}-12`;

function entry(overrides: Partial<CashEntryInput> = {}): CashEntryInput {
  return {
    kind: 'spend',
    amountIls: 50,
    category: 'סופר',
    note: null,
    date: `${MONTH}-10`,
    envelopeId: null,
    memberId: null,
    walletId: null,
    ...overrides,
  };
}

async function newWallet(name: string): Promise<string> {
  const { data, error } = await db().from('cash_wallets').insert({ name, position: 1 }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

let yitzchak: string;
let main: string;

beforeEach(async () => {
  resetDb();
  yitzchak = await seedMember(111, 'יצחק');
  signIn(yitzchak);
  main = sql<{ id: string }>('select id from cash_wallets where is_default')[0]!.id;
});

describe('wallet settings (V1-04)', () => {
  it('sets the amount in a wallet by storing the difference, leaving history and other wallets alone', async () => {
    const sara = await newWallet('הארנק של שרה');
    await addCashEntry(entry({ kind: 'withdrawal', amountIls: 1000, category: '' }));
    await addCashEntry(entry({ amountIls: 150 }));
    await transferBetweenWallets({ fromWalletId: main, toWalletId: sara, amountIls: 200, date: `${MONTH}-11`, note: null });

    // The ledger says 650 in the main wallet; really there is 600.
    const result = await setWalletBalance(main, 600, DAY);
    expect(result.ok).toBe(true);

    expect(sql('select source, amount_ils, wallet_id = ' + `'${main}'` + ' as main from cash_topups where source = \'adjustment\'')).toEqual([
      { source: 'adjustment', amount_ils: -50, main: true },
    ]);
    // Nothing that was there before changed.
    expect(sql("select amount_ils from cash_topups where source <> 'adjustment'")).toEqual([{ amount_ils: 1000 }]);
    expect(sql('select amount_ils from cash_spends')).toEqual([{ amount_ils: 150 }]);

    const { wallet } = await loadDashboard(MONTH, yitzchak);
    expect(wallet.wallets.find((w) => w.id === main)?.balance).toBe(600);
    expect(wallet.wallets.find((w) => w.id === sara)?.balance).toBe(200);
    expect(wallet.balance).toBe(800);
    // An adjustment is not a withdrawal.
    expect(wallet.withdrawn).toBe(1000);
    const adjustment = wallet.movements.find((m) => m.kind === 'adjustment');
    expect(adjustment).toMatchObject({ amountIls: -50, walletId: main, date: DAY });
  });

  it('adds nothing when the amount already matches, and adds upward when there is more', async () => {
    await addCashEntry(entry({ kind: 'withdrawal', amountIls: 300, category: '' }));
    expect((await setWalletBalance(main, 300, DAY)).ok).toBe(true);
    expect(sql("select count(*)::int as n from cash_topups where source = 'adjustment'")).toEqual([{ n: 0 }]);

    expect((await setWalletBalance(main, 420.5, DAY)).ok).toBe(true);
    expect(sql("select amount_ils from cash_topups where source = 'adjustment'")).toEqual([{ amount_ils: 120.5 }]);
    expect((await loadDashboard(MONTH, yitzchak)).wallet.balance).toBe(420.5);
  });

  it('undoes an adjustment by dismissing it', async () => {
    await setWalletBalance(main, 500, DAY);
    const [row] = sql<{ id: string }>("select id from cash_topups where source = 'adjustment'");
    expect((await deleteCashEntry(row!.id, 'withdrawal')).ok).toBe(true);
    expect((await loadDashboard(MONTH, yitzchak)).wallet.balance).toBe(0);
  });

  it('refuses a negative or non-numeric amount', async () => {
    expect((await setWalletBalance(main, -5, DAY)).ok).toBe(false);
    expect((await setWalletBalance(main, Number.NaN, DAY)).ok).toBe(false);
  });

  it('adds money to a chosen wallet as a withdrawal, cash income, or just money', async () => {
    const sara = await newWallet('הארנק של שרה');
    expect((await addMoneyToWallet({ walletId: sara, amountIls: 100, from: 'withdrawal', note: null, date: DAY })).ok).toBe(true);
    expect((await addMoneyToWallet({ walletId: sara, amountIls: 40, from: 'income', note: 'מתנה', date: DAY })).ok).toBe(true);
    expect((await addMoneyToWallet({ walletId: sara, amountIls: 25, from: 'other', note: null, date: DAY })).ok).toBe(true);
    expect((await addMoneyToWallet({ walletId: sara, amountIls: 0, from: 'other', note: null, date: DAY })).ok).toBe(false);

    expect(sql('select source, amount_ils from cash_topups order by amount_ils desc')).toEqual([
      { source: 'manual', amount_ils: 100 },
      { source: 'cash_income', amount_ils: 40 },
      { source: 'adjustment', amount_ils: 25 },
    ]);
    const { wallet } = await loadDashboard(MONTH, yitzchak);
    expect(wallet.wallets.find((w) => w.id === sara)?.balance).toBe(165);
    expect(wallet.withdrawn).toBe(100);
    expect(wallet.income).toBe(40);
  });

  it('deletes an empty wallet that never held anything', async () => {
    const empty = await newWallet('קופה קטנה');
    const result = await deleteWallet(empty);
    expect(result).toMatchObject({ ok: true, outcome: 'deleted' });
    expect(sql(`select count(*)::int as n from cash_wallets where id = '${empty}'`)).toEqual([{ n: 0 }]);
  });

  it('keeps the history of an emptied wallet: it is put away, not erased', async () => {
    const sara = await newWallet('הארנק של שרה');
    await addCashEntry(entry({ kind: 'withdrawal', amountIls: 1000, category: '' }));
    await transferBetweenWallets({ fromWalletId: main, toWalletId: sara, amountIls: 300, date: `${MONTH}-11`, note: null });
    await addCashEntry(entry({ amountIls: 300, walletId: sara }));

    const result = await deleteWallet(sara);
    expect(result).toMatchObject({ ok: true, outcome: 'archived' });
    expect(sql(`select is_archived from cash_wallets where id = '${sara}'`)).toEqual([{ is_archived: true }]);
    expect(sql(`select count(*)::int as n from cash_spends where wallet_id = '${sara}'`)).toEqual([{ n: 1 }]);

    const { wallet } = await loadDashboard(MONTH, yitzchak);
    expect(wallet.wallets.map((w) => w.id)).toEqual([main]);
    expect(wallet.balance).toBe(700);
    expect(wallet.wallets[0]?.balance).toBe(700);
  });

  it('will not delete a wallet with money in it, or the default wallet', async () => {
    const sara = await newWallet('הארנק של שרה');
    await addCashEntry(entry({ kind: 'withdrawal', amountIls: 80, category: '', walletId: sara }));
    const full = await deleteWallet(sara);
    expect(full.ok).toBe(false);
    expect(sql(`select is_archived from cash_wallets where id = '${sara}'`)).toEqual([{ is_archived: false }]);

    const defaultWallet = await deleteWallet(main);
    expect(defaultWallet.ok).toBe(false);
  });

  it('needs a signed-in member', async () => {
    signOut();
    expect(await setWalletBalance(main, 10, DAY)).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
    expect(await addMoneyToWallet({ walletId: main, amountIls: 10, from: 'other', note: null, date: DAY })).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
    expect(await deleteWallet(main)).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
    expect(sql('select count(*)::int as n from cash_topups')).toEqual([{ n: 0 }]);
  });
});
