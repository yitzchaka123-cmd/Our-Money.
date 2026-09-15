import { describe, expect, it } from 'vitest';

import { monthBounds, totalsByCategory, totalsByMember, walletState } from '@/lib/reconcile';
import type { CashSpend, CashTopup } from '@/lib/types';

function topup(amount: number, overrides: Partial<CashTopup> = {}): CashTopup {
  return {
    id: crypto.randomUUID(),
    amount_ils: amount,
    occurred_at: '2026-09-01',
    source: 'riseup_withdrawal',
    riseup_transaction_id: crypto.randomUUID(),
    business_name: 'משיכת מזומן',
    note: null,
    is_dismissed: false,
    ...overrides,
  };
}

function spend(amount: number, overrides: Partial<CashSpend> = {}): CashSpend {
  return {
    id: crypto.randomUUID(),
    member_id: 'member-a',
    amount_ils: amount,
    category: 'מזון וצריכה',
    note: null,
    spent_at: '2026-09-02',
    status: 'confirmed',
    confidence: 'high',
    input_kind: 'text',
    raw_input: null,
    transcript: null,
    telegram_update_id: null,
    telegram_chat_id: null,
    telegram_message_id: null,
    bot_message_id: null,
    created_at: '2026-09-02T10:00:00Z',
    ...overrides,
  };
}

describe('walletState', () => {
  it('reports cash withdrawn but not yet logged', () => {
    const state = walletState([topup(500), topup(300)], [spend(120), spend(80)]);

    expect(state.toppedUp).toBe(800);
    expect(state.logged).toBe(200);
    expect(state.unaccounted).toBe(600);
  });

  it('ignores dismissed top-ups and deleted spends', () => {
    const state = walletState(
      [topup(500), topup(1000, { is_dismissed: true })],
      [spend(100), spend(9999, { status: 'deleted' })],
    );

    expect(state.toppedUp).toBe(500);
    expect(state.logged).toBe(100);
    expect(state.unaccounted).toBe(400);
    expect(state.topupCount).toBe(1);
    expect(state.spendCount).toBe(1);
  });

  it('goes negative when more was logged than withdrawn', () => {
    // Real and worth surfacing: it means a withdrawal was missed, usually
    // because the bank words it in a way the detector does not match yet.
    const state = walletState([topup(100)], [spend(250)]);
    expect(state.unaccounted).toBe(-150);
  });

  it('does not accumulate floating point noise', () => {
    const state = walletState([topup(0.1), topup(0.2)], [spend(0.3)]);
    expect(state.unaccounted).toBe(0);
  });

  it('counts an empty wallet as balanced', () => {
    expect(walletState([], []).unaccounted).toBe(0);
  });
});

describe('totalsByCategory', () => {
  it('groups and sorts by amount descending', () => {
    const totals = totalsByCategory([
      spend(50, { category: 'מסעדות' }),
      spend(120, { category: 'מזון וצריכה' }),
      spend(30, { category: 'מסעדות' }),
    ]);

    expect(totals).toEqual([
      { category: 'מזון וצריכה', total: 120, count: 1 },
      { category: 'מסעדות', total: 80, count: 2 },
    ]);
  });

  it('excludes deleted rows', () => {
    const totals = totalsByCategory([
      spend(50, { category: 'מסעדות' }),
      spend(500, { category: 'מסעדות', status: 'deleted' }),
    ]);
    expect(totals).toEqual([{ category: 'מסעדות', total: 50, count: 1 }]);
  });
});

describe('totalsByMember', () => {
  it('splits spending between the two of them', () => {
    const totals = totalsByMember([
      spend(100, { member_id: 'a' }),
      spend(60, { member_id: 'b' }),
      spend(40, { member_id: 'a' }),
    ]);

    expect(totals.get('a')).toBe(140);
    expect(totals.get('b')).toBe(60);
  });
});

describe('monthBounds', () => {
  it('covers a 30-day month', () => {
    expect(monthBounds('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('covers a 31-day month', () => {
    expect(monthBounds('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('handles February in a leap year', () => {
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('handles February in a non-leap year', () => {
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});
