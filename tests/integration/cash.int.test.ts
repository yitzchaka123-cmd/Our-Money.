import { beforeEach, describe, expect, it } from 'vitest';

import { SESSION_EXPIRED_MESSAGE } from '@/lib/auth/member';
import {
  addCashEntry,
  deleteCashEntry,
  moveCashEntryToMonth,
  moveCashSpendsToEnvelope,
  splitCashEntry,
  transferBetweenWallets,
  updateCashEntry,
  type CashEntryInput,
} from '@/lib/cash/actions';
import { loadDashboard } from '@/lib/dashboard/data';

import { resetDb, seedMember, seedMonth, signIn, signOut, sql } from './helpers';

const MONTH = '2026-09';

function entry(overrides: Partial<CashEntryInput> = {}): CashEntryInput {
  return {
    kind: 'spend',
    amountIls: 50,
    category: 'סופר',
    note: 'מכולת',
    date: `${MONTH}-10`,
    envelopeId: null,
    memberId: null,
    walletId: null,
    ...overrides,
  };
}

let yitzchak: string;

beforeEach(async () => {
  resetDb();
  yitzchak = await seedMember(111, 'יצחק');
  await seedMember(222, 'שרה');
  await seedMonth(MONTH);
  signIn(yitzchak);
});

describe('cash actions against the real schema', () => {
  it('refuses to write without a session, with a sentence the couple can act on', async () => {
    signOut();
    const result = await addCashEntry(entry());
    expect(result).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
    expect(sql('select id from cash_spends')).toHaveLength(0);
  });

  it('files a spend into the tracker its category names, in the default wallet, as the signed-in member', async () => {
    const result = await addCashEntry(entry({ category: 'אוכל בחוץ', amountIls: 80 }));
    expect(result.ok).toBe(true);
    const [row] = sql<{ envelope_id: string; envelope_type: string; member_id: string; wallet_id: string; input_kind: string }>(
      'select s.envelope_id, s.envelope_type, s.member_id, s.wallet_id, s.input_kind from cash_spends s',
    );
    expect(row).toMatchObject({ envelope_id: `${MONTH}-food`, envelope_type: 'trackingCategory', member_id: yitzchak, input_kind: 'web' });
    const [wallet] = sql<{ id: string }>('select id from cash_wallets where is_default');
    expect(row!.wallet_id).toBe(wallet!.id);
  });

  it('shows cash inside RiseUp envelopes and keeps the ATM withdrawal out of spending', async () => {
    await addCashEntry(entry({ category: 'ביטוח', amountIls: 200 }));
    await addCashEntry(entry({ kind: 'income', category: 'מתנה', amountIls: 300, note: 'מסבתא' }));

    const data = await loadDashboard(MONTH, yitzchak);
    const variable = data.envelopes.find((e) => e.type === 'variable')!;
    const fixed = data.envelopes.find((e) => e.type === 'fixed')!;
    const cashIncome = data.envelopes.find((e) => e.type === 'cashIncome')!;

    // 3000 at the supermarket; the 500 withdrawal is cash changing hands.
    expect(variable.actual).toBe(3000);
    // "ביטוח" is a label RiseUp used in the fixed envelope, so it goes there.
    expect(fixed.actual).toBe(3700);
    expect(fixed.expected).toBe(4200);
    expect(cashIncome.actual).toBe(300);
    expect(data.greeting).toBe('יצחק');
    // 12000 + 300 in, 5000 + 4200 + 600 + 1000 expected out.
    expect(data.forecast).toBe(12300 - 10800);
  });

  it('keeps a split whole: parts must add up, and the original keeps the first part', async () => {
    const created = await addCashEntry(entry({ amountIls: 100 }));
    if (!created.ok) throw new Error(created.error);

    const wrong = await splitCashEntry(created.id, 'spend', [
      { amountIls: 60, category: 'סופר', envelopeId: null, note: null },
      { amountIls: 30, category: 'אוכל בחוץ', envelopeId: null, note: null },
    ]);
    expect(wrong.ok).toBe(false);

    const right = await splitCashEntry(created.id, 'spend', [
      { amountIls: 60, category: 'סופר', envelopeId: null, note: null },
      { amountIls: 40, category: 'אוכל בחוץ', envelopeId: null, note: null },
    ]);
    expect(right.ok).toBe(true);
    const rows = sql<{ amount_ils: number; envelope_type: string }>('select amount_ils, envelope_type from cash_spends order by amount_ils desc');
    expect(rows).toEqual([
      { amount_ils: 60, envelope_type: 'variable' },
      { amount_ils: 40, envelope_type: 'trackingCategory' },
    ]);
  });

  it('moves an entry to another month on the same day, clamped, re-pinned to that month', async () => {
    await seedMonth('2026-02');
    const created = await addCashEntry(entry({ date: `${MONTH}-30`, category: 'אוכל בחוץ' }));
    if (!created.ok) throw new Error(created.error);
    expect((await moveCashEntryToMonth(created.id, 'spend', '2026-02')).ok).toBe(true);
    const [row] = sql<{ spent_at: string; envelope_id: string }>('select spent_at, envelope_id from cash_spends');
    expect(row).toEqual({ spent_at: '2026-02-28', envelope_id: '2026-02-food' });
  });

  it('moves several spends together, but only within one month', async () => {
    const a = await addCashEntry(entry({ amountIls: 10 }));
    const b = await addCashEntry(entry({ amountIls: 20 }));
    if (!a.ok || !b.ok) throw new Error('seed failed');
    expect((await moveCashSpendsToEnvelope([a.id, b.id], `${MONTH}-food`)).ok).toBe(true);
    expect(sql<{ category: string }>('select distinct category from cash_spends')).toEqual([{ category: 'אוכל בחוץ' }]);

    await seedMonth('2026-08');
    const c = await addCashEntry(entry({ date: '2026-08-10' }));
    if (!c.ok) throw new Error('seed failed');
    const mixed = await moveCashSpendsToEnvelope([a.id, c.id], `${MONTH}-var`);
    expect(mixed).toEqual({ ok: false, error: 'אפשר להזיז יחד רק הוצאות מאותו חודש.' });
  });

  it('balances wallets across withdrawals, spends and transfers', async () => {
    const [main] = sql<{ id: string }>('select id from cash_wallets where is_default');
    const { data: sara } = await (await import('@/lib/db/client')).db()
      .from('cash_wallets')
      .insert({ name: 'הארנק של שרה', position: 1 })
      .select('id')
      .single();

    await addCashEntry(entry({ kind: 'withdrawal', amountIls: 1000, category: '' }));
    await addCashEntry(entry({ amountIls: 150 }));
    await transferBetweenWallets({ fromWalletId: main!.id, toWalletId: sara!.id as string, amountIls: 300, date: `${MONTH}-11`, note: null });
    await addCashEntry(entry({ amountIls: 40, walletId: sara!.id as string }));

    const { wallet } = await loadDashboard(MONTH, yitzchak);
    expect(wallet.balance).toBe(810);
    expect(wallet.wallets.find((w) => w.isDefault)?.balance).toBe(550);
    expect(wallet.wallets.find((w) => !w.isDefault)?.balance).toBe(260);
    expect(wallet.withdrawn).toBe(1000);
  });

  it('protects a bank withdrawal: amount and date stay the bank’s, only the wallet and note change', async () => {
    const { db } = await import('@/lib/db/client');
    const { data } = await db()
      .from('cash_topups')
      .insert({ amount_ils: 500, occurred_at: `${MONTH}-05`, source: 'riseup_withdrawal', riseup_transaction_id: 'tx-1' })
      .select('id')
      .single();
    const id = data!.id as string;

    const result = await updateCashEntry(id, entry({ kind: 'withdrawal', amountIls: 9999, date: `${MONTH}-20`, note: 'לחופשה', category: '' }));
    expect(result.ok).toBe(true);
    expect(sql('select amount_ils, occurred_at, note from cash_topups')).toEqual([
      { amount_ils: 500, occurred_at: `${MONTH}-05`, note: 'לחופשה' },
    ]);

    expect((await deleteCashEntry(id, 'withdrawal')).ok).toBe(true);
    expect(sql('select is_dismissed from cash_topups')).toEqual([{ is_dismissed: true }]);
  });
});
