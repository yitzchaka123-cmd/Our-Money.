import { describe, expect, it } from 'vitest';

import { walletBalances, walletState } from '@/lib/reconcile';
import type { CashSpend, CashTopup, CashTransfer, CashWallet } from '@/lib/types';

const main: CashWallet = { id: 'w-main', name: 'ארנק ראשי', member_id: null, is_default: true, is_archived: false, position: 0 };
const sara: CashWallet = { id: 'w-sara', name: 'הארנק של שרה', member_id: 'm2', is_default: false, is_archived: false, position: 1 };

function topup(amount: number, o: Partial<CashTopup> = {}): CashTopup {
  return {
    id: crypto.randomUUID(), amount_ils: amount, occurred_at: '2026-09-01', source: 'riseup_withdrawal',
    riseup_transaction_id: null, business_name: null, note: null, is_dismissed: false, member_id: null,
    category: null, input_kind: 'text', wallet_id: null, ...o,
  };
}
function spend(amount: number, o: Partial<CashSpend> = {}): CashSpend {
  return {
    id: crypto.randomUUID(), member_id: 'm1', amount_ils: amount, category: 'סופר', note: null, spent_at: '2026-09-02',
    status: 'confirmed', confidence: 'high', input_kind: 'text', raw_input: null, transcript: null,
    telegram_update_id: null, telegram_chat_id: null, telegram_message_id: null, bot_message_id: null,
    envelope_id: null, envelope_type: null, wallet_id: null, created_at: '2026-09-02T10:00:00Z', ...o,
  };
}
function transfer(amount: number, from: string, to: string): CashTransfer {
  return { id: crypto.randomUUID(), from_wallet_id: from, to_wallet_id: to, amount_ils: amount, occurred_at: '2026-09-03', member_id: null, note: null, is_dismissed: false };
}

describe('walletBalances', () => {
  it('keeps each wallet separate', () => {
    const balances = walletBalances(
      [main, sara],
      [topup(500, { wallet_id: 'w-main' }), topup(200, { wallet_id: 'w-sara', source: 'cash_income' })],
      [spend(100, { wallet_id: 'w-main' }), spend(50, { wallet_id: 'w-sara' })],
      [],
    );
    expect(balances).toEqual([
      { walletId: 'w-main', in: 500, out: 100, balance: 400 },
      { walletId: 'w-sara', in: 200, out: 50, balance: 150 },
    ]);
  });

  it('counts rows with no wallet toward the default wallet', () => {
    // Everything logged before wallets existed has a null wallet_id.
    const balances = walletBalances([main, sara], [topup(300)], [spend(80)], []);
    expect(balances[0]).toMatchObject({ walletId: 'w-main', balance: 220 });
    expect(balances[1]).toMatchObject({ walletId: 'w-sara', balance: 0 });
  });

  it('moves money between wallets without changing the total', () => {
    const balances = walletBalances(
      [main, sara],
      [topup(1000, { wallet_id: 'w-main' })],
      [],
      [transfer(400, 'w-main', 'w-sara')],
    );
    expect(balances.map((b) => b.balance)).toEqual([600, 400]);
    expect(balances.reduce((s, b) => s + b.balance, 0)).toBe(1000);
  });

  it('ignores dismissed transfers, top-ups and deleted spends', () => {
    const balances = walletBalances(
      [main, sara],
      [topup(1000, { wallet_id: 'w-main' }), topup(9, { wallet_id: 'w-main', is_dismissed: true })],
      [spend(7, { wallet_id: 'w-main', status: 'deleted' })],
      [{ ...transfer(400, 'w-main', 'w-sara'), is_dismissed: true }],
    );
    expect(balances.map((b) => b.balance)).toEqual([1000, 0]);
  });

  it('agrees with the single-wallet total', () => {
    const topups = [topup(1000, { wallet_id: 'w-main' }), topup(250, { wallet_id: 'w-sara', source: 'cash_income' })];
    const spends = [spend(120, { wallet_id: 'w-main' }), spend(30, { wallet_id: 'w-sara' })];
    const perWallet = walletBalances([main, sara], topups, spends, [transfer(200, 'w-main', 'w-sara')]);
    const total = perWallet.reduce((s, b) => s + b.balance, 0);
    expect(total).toBe(walletState(topups, spends).unaccounted);
  });
});
