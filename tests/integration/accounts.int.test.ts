import { beforeEach, describe, expect, it } from 'vitest';

import { SESSION_EXPIRED_MESSAGE } from '@/lib/auth/member';
import { searchTransactions } from '@/lib/dashboard/actions';
import { setAccountLabel } from '@/lib/dashboard/account-actions';
import { loadAccountSummaries } from '@/lib/dashboard/account-summaries';
import { loadDashboard } from '@/lib/dashboard/data';
import { db } from '@/lib/db/client';

import { resetDb, seedMember, seedMonth, signIn, signOut, sql } from './helpers';

const MONTH = '2026-10';

let yitzchak: string;

async function seedCards(): Promise<void> {
  await seedMonth(MONTH);
  const supabase = db();
  const row = (id: string, amount: number, source: string, hash: string, extra: Record<string, unknown> = {}) => ({
    month: MONTH,
    envelope_id: `${MONTH}-var`,
    transaction_id: `${MONTH}-${id}`,
    transaction_date: `${MONTH}-01`,
    billing_date: `${MONTH}-01`,
    business_name: id === 'bag' ? 'באג בית שמש' : 'קרביץ ישראל',
    amount_ils: amount,
    is_income: false,
    source,
    account_number_hash: hash,
    ...extra,
  });
  const { error } = await supabase.from('riseup_envelope_actuals').insert([
    row('bag', 60, 'leumicard', 'cc5910'),
    row('krav', 64.3, 'leumicard', 'cc5910'),
    row('bank', 120, 'leumiBank', 'bk0001'),
  ]);
  if (error) throw new Error(error.message);
  const { error: txError } = await supabase.from('riseup_transactions').insert([
    { transaction_id: 'old-1', cashflow_month: '2026-08', source: 'isracard', source_type: 'creditCard', account_number_hash: 'is7722', amount_ils: 10 },
  ]);
  if (txError) throw new Error(txError.message);
}

function cardAccountNames(data: Awaited<ReturnType<typeof loadDashboard>>): string[] {
  return data.envelopes
    .flatMap((e) => e.actuals)
    .filter((a) => a.source === 'leumicard')
    .map((a) => a.accountName ?? '');
}

beforeEach(async () => {
  resetDb();
  yitzchak = await seedMember(111, 'יצחק');
  signIn(yitzchak);
  await seedCards();
});

describe('card and account names (V1-07)', () => {
  it('shows the provider instead of RiseUp’s code, until you name the card', async () => {
    expect(cardAccountNames(await loadDashboard(MONTH, yitzchak))).toEqual(['לאומי קארד', 'לאומי קארד']);

    expect(await setAccountLabel('leumicard', 'cc5910', '  כרטיס   0848 ')).toEqual({ ok: true });
    expect(sql('select source, account_number_hash, label from account_labels')).toEqual([
      { source: 'leumicard', account_number_hash: 'cc5910', label: 'כרטיס 0848' },
    ]);
    const data = await loadDashboard(MONTH, yitzchak);
    expect(cardAccountNames(data)).toEqual(['כרטיס 0848', 'כרטיס 0848']);
    // The bank account was not renamed.
    expect(data.envelopes.flatMap((e) => e.actuals).find((a) => a.source === 'leumiBank')?.accountName).toBe('בנק לאומי');
  });

  it('renames, and an empty name goes back to the provider', async () => {
    await setAccountLabel('leumicard', 'cc5910', 'כרטיס 0848');
    await setAccountLabel('leumicard', 'cc5910', 'הכרטיס של שרה');
    expect(sql('select label from account_labels')).toEqual([{ label: 'הכרטיס של שרה' }]);
    await setAccountLabel('leumicard', 'cc5910', '   ');
    expect(sql('select count(*)::int as n from account_labels')).toEqual([{ n: 0 }]);
    expect(cardAccountNames(await loadDashboard(MONTH, yitzchak))).toEqual(['לאומי קארד', 'לאומי קארד']);
  });

  it('uses the same name in search results', async () => {
    await setAccountLabel('leumicard', 'cc5910', 'כרטיס 0848');
    const result = await searchTransactions('באג');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.hits.map((h) => h.detail)).toEqual(['כרטיס 0848']);
  });

  it('lists every account with this month’s charges', async () => {
    await setAccountLabel('leumicard', 'cc5910', 'כרטיס 0848');
    const accounts = await loadAccountSummaries(MONTH);
    expect(accounts.map((a) => [a.displayName, a.kind, a.monthCharges, a.monthChargeCount])).toEqual([
      ['כרטיס 0848', 'card', 124.3, 2],
      ['ישראכרט', 'card', 0, 0],
      ['בנק לאומי', 'bank', 120, 1],
    ]);
  });

  it('numbers two unnamed cards from the same provider instead of showing their codes (V1-check-6)', async () => {
    const { error } = await db().from('riseup_envelope_actuals').insert({
      month: MONTH,
      envelope_id: `${MONTH}-var`,
      transaction_id: `${MONTH}-second-card`,
      transaction_date: `${MONTH}-02`,
      billing_date: `${MONTH}-02`,
      business_name: 'סופר',
      amount_ils: 30,
      is_income: false,
      source: 'leumicard',
      account_number_hash: 'aa1111',
    });
    if (error) throw new Error(error.message);

    const data = await loadDashboard(MONTH, yitzchak);
    const names = data.envelopes
      .flatMap((e) => e.actuals)
      .filter((a) => a.source === 'leumicard')
      .map((a) => [a.accountNumberHash, a.accountName]);
    expect(names).toEqual(
      expect.arrayContaining([
        ['aa1111', 'לאומי קארד 1'],
        ['cc5910', 'לאומי קארד 2'],
      ]),
    );
    expect(JSON.stringify(names.map((n) => n[1]))).not.toMatch(/cc5910|aa1111/);

    // Once one is named, the other is just "לאומי קארד" again.
    await setAccountLabel('leumicard', 'cc5910', 'כרטיס 0848');
    const after = (await loadDashboard(MONTH, yitzchak)).envelopes.flatMap((e) => e.actuals).filter((a) => a.source === 'leumicard');
    expect(new Set(after.map((a) => a.accountName))).toEqual(new Set(['כרטיס 0848', 'לאומי קארד']));
  });

  it('needs a signed-in member and a sensible name', async () => {
    expect(await setAccountLabel('leumicard', 'cc5910', 'x'.repeat(41))).toMatchObject({ ok: false });
    signOut();
    expect(await setAccountLabel('leumicard', 'cc5910', 'כרטיס 0848')).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
    expect(sql('select count(*)::int as n from account_labels')).toEqual([{ n: 0 }]);
  });
});
