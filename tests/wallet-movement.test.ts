import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WalletMovementSheet } from '@/app/dashboard/components/WalletMovementSheet';
import type { EnvelopeView, WalletMovement } from '@/lib/dashboard/data';
import { movementTransaction } from '@/lib/dashboard/movement-transaction';
import type { NormalizedActual } from '@/lib/riseup/envelopes';

function movement(o: Partial<WalletMovement>): WalletMovement {
  return {
    id: 'm-1', kind: 'spend', amountIls: 45, date: '2026-10-10', label: 'סופר', memberName: 'יצחק', memberId: 'u1',
    category: 'סופר', walletId: 'w-main', walletName: 'ארנק ראשי', note: null, fromBank: false, ...o,
  };
}

const cashRow: NormalizedActual = {
  transactionId: 'cash:m-1', transactionDate: '2026-10-10', billingDate: '2026-10-10', businessName: 'סופר', amountIls: 45,
  isIncome: false, accountNickname: 'מזומן', accountNumberHash: null, source: 'cash', isInstallment: false, paymentNumber: null,
  totalPayments: null, categoryLabel: 'סופר',
  cash: { id: 'm-1', kind: 'spend', memberId: 'u1', memberName: 'יצחק', inputKind: 'voice', status: 'confirmed', walletId: 'w-main' },
};

const supermarket = {
  key: 'tracker-super', envelopeId: 'env-super', type: 'trackingCategory', title: 'סופר', actual: 45, expected: 3000,
  showRemaining: true, pending: [], pendingTotal: 0, actuals: [cashRow],
} as unknown as EnvelopeView;

describe('a wallet row opens the transaction sheet (V4-07)', () => {
  it('a cash spend opens as the same row, in the same envelope, as inside the envelopes', () => {
    const txn = movementTransaction([supermarket], movement({}));
    expect(txn).toEqual({ actual: cashRow, envelopeTitle: 'סופר', envelopeType: 'trackingCategory', envelopeId: 'env-super' });
  });

  it('a row no envelope shows still opens the sheet, built from the movement', () => {
    const txn = movementTransaction([], movement({ id: 'i-1', kind: 'income', amountIls: 600, label: 'שיעורים', category: 'אחר' }));
    expect(txn?.envelopeType).toBe('cashIncome');
    expect(txn?.actual.cash).toMatchObject({ id: 'i-1', kind: 'income', walletId: 'w-main', memberId: 'u1' });
    expect(txn?.actual.amountIls).toBe(600);
  });

  it('transfers, withdrawals and balance updates are not envelope rows', () => {
    expect(movementTransaction([supermarket], movement({ kind: 'withdrawal' }))).toBeNull();
    expect(movementTransaction([supermarket], movement({ kind: 'adjustment' }))).toBeNull();
    expect(movementTransaction([supermarket], movement({ kind: 'transfer' }))).toBeNull();
  });
});

describe('the sheet for a withdrawal or money added (V4-07)', () => {
  const render = (m: WalletMovement) =>
    renderToStaticMarkup(
      createElement(WalletMovementSheet, { movement: m, onClose: () => {}, onAction: () => {}, onEdit: () => {}, onDelete: () => {}, onOpenWallet: () => {} }),
    );

  it('money added by hand: the amount, the wallet, a note, and undo — not the wallet settings', () => {
    const html = render(movement({ id: 'a1', kind: 'adjustment', amountIls: 3540, label: 'הוספת כסף לארנק', category: null, date: '2026-10-15' }));
    expect(html).toContain('3,540');
    expect(html).toContain('ארנק ראשי');
    expect(html).toContain('להוסיף הערה');
    expect(html).toContain('לבטל את הרישום');
    expect(html).not.toContain('הגדרות ארנק');
  });

  it('a typed withdrawal: note, which wallet, another month, edit, delete', () => {
    const html = render(movement({ id: 'w1', kind: 'withdrawal', amountIls: 500, label: 'משיכת מזומן', category: 'משיכה' }));
    for (const label of ['להוסיף הערה', 'לאיזה ארנק נכנס הכסף?', 'להזיז את העסקה לחודש אחר', 'לערוך — סכום, תאריך, ארנק', 'למחוק את הרישום']) {
      expect(html).toContain(label);
    }
  });

  it('a withdrawal from the bank keeps its amount, date and month', () => {
    const html = render(movement({ id: 'w2', kind: 'withdrawal', amountIls: 500, label: 'משיכת מזומן', fromBank: true }));
    expect(html).toContain('לאיזה ארנק נכנס הכסף?');
    expect(html).toContain('זו לא משיכה');
    expect(html).not.toContain('להזיז את העסקה לחודש אחר');
    expect(html).not.toContain('לערוך — סכום');
  });
});
