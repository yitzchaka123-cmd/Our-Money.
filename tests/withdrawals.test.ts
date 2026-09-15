import { describe, expect, it } from 'vitest';

import { isWithdrawal, toDateOnly } from '@/lib/riseup/withdrawals';
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
