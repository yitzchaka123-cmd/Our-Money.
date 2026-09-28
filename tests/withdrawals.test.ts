import { describe, expect, it } from 'vitest';

import { isWithdrawal, matchManualWithdrawals, toDateOnly } from '@/lib/riseup/withdrawals';
import type { RiseupTransaction } from '@/lib/types';

function transaction(overrides: Partial<RiseupTransaction> = {}): RiseupTransaction {
  return {
    transactionId: 'tx-1',
    transactionDate: '2026-09-14T00:00:00.000Z',
    cashflowDate: '2026-09',
    businessName: 'משיכת מזומן',
    isIncome: false,
    amount: 500,
    sourceType: 'checkingAccount',
    source: 'bank',
    ...overrides,
  };
}

describe('isWithdrawal', () => {
  it.each([
    'משיכת מזומן',
    'משיכת  מזומן',
    'משיכת מזומנים',
    'משיכת שטרות',
    'כספומט הפועלים',
    'בנקט',
    'משיכה במכשיר אוטומטי',
    'ATM WITHDRAWAL',
    'Cash Withdrawal',
  ])('matches %s', (businessName) => {
    expect(isWithdrawal(transaction({ businessName }))).toBe(true);
  });

  it('ignores income, even when the wording matches', () => {
    expect(isWithdrawal(transaction({ isIncome: true }))).toBe(false);
  });

  it('ignores credit card transactions', () => {
    expect(
      isWithdrawal(transaction({ sourceType: 'creditCard', businessName: 'משיכת מזומן' })),
    ).toBe(false);
  });

  it('treats an unknown source type as eligible rather than dropping it', () => {
    // Older RiseUp transactions have no sourceType; a real withdrawal should
    // still be caught rather than silently skipped.
    expect(isWithdrawal(transaction({ sourceType: undefined }))).toBe(true);
  });

  it('does not match ordinary shopping', () => {
    expect(isWithdrawal(transaction({ businessName: 'שופרסל דיל' }))).toBe(false);
  });

  it('does not match a merchant that merely contains a matching word', () => {
    expect(isWithdrawal(transaction({ businessName: 'מסעדת הכספית' }))).toBe(false);
  });
});

describe('toDateOnly', () => {
  it('drops the time from a RiseUp ISO datetime', () => {
    expect(toDateOnly('2026-06-15T00:00:00.000Z')).toBe('2026-06-15');
  });

  it('returns null for missing input', () => {
    expect(toDateOnly(undefined)).toBeNull();
  });

  it('returns null for junk', () => {
    expect(toDateOnly('not a date')).toBeNull();
  });
});

describe('matchManualWithdrawals', () => {
  it('links a bank withdrawal to a manual one of the same amount within three days', () => {
    const bank = transaction({ transactionId: 'tx-a', transactionDate: '2026-09-15T00:00:00.000Z' });
    const result = matchManualWithdrawals([bank], [
      { id: 'm-1', amount_ils: 500, occurred_at: '2026-09-13' },
    ]);
    expect(result.links).toEqual([{ transaction: bank, manualId: 'm-1' }]);
    expect(result.unmatched).toEqual([]);
  });

  it('leaves a withdrawal unmatched when the amount differs or the dates are too far apart', () => {
    const bank = transaction({ transactionDate: '2026-09-15T00:00:00.000Z' });
    const result = matchManualWithdrawals([bank], [
      { id: 'wrong-amount', amount_ils: 400, occurred_at: '2026-09-15' },
      { id: 'too-early', amount_ils: 500, occurred_at: '2026-09-11' },
    ]);
    expect(result.links).toEqual([]);
    expect(result.unmatched).toEqual([bank]);
  });

  it('uses each manual entry once and prefers the closest date', () => {
    const first = transaction({ transactionId: 'tx-1', transactionDate: '2026-09-10T00:00:00.000Z' });
    const second = transaction({ transactionId: 'tx-2', transactionDate: '2026-09-12T00:00:00.000Z' });
    const result = matchManualWithdrawals([second, first], [
      { id: 'm-near-second', amount_ils: 500, occurred_at: '2026-09-12' },
      { id: 'm-near-first', amount_ils: 500, occurred_at: '2026-09-10' },
    ]);
    expect(result.links.map((l) => [l.transaction.transactionId, l.manualId])).toEqual([
      ['tx-1', 'm-near-first'],
      ['tx-2', 'm-near-second'],
    ]);
  });

  it('does not match a single manual entry to two bank withdrawals', () => {
    const a = transaction({ transactionId: 'tx-a' });
    const b = transaction({ transactionId: 'tx-b' });
    const result = matchManualWithdrawals([a, b], [
      { id: 'm-1', amount_ils: 500, occurred_at: '2026-09-14' },
    ]);
    expect(result.links).toHaveLength(1);
    expect(result.unmatched).toHaveLength(1);
  });
});
