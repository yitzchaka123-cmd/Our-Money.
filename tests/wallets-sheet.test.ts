import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WalletCard } from '@/app/dashboard/components/WalletCard';
import { WalletsSheet, type WalletsSheetFocus } from '@/app/dashboard/components/WalletsSheet';
import type { WalletMovement, WalletSummary } from '@/lib/dashboard/data';

const wallets: WalletSummary[] = [
  { id: 'w-main', name: 'ארנק ראשי', balance: 365, isDefault: true, memberName: null },
  { id: 'w-sara', name: 'הארנק של שרה', balance: 150, isDefault: false, memberName: 'שרה' },
];

const adjustment: WalletMovement = {
  id: 'a1', kind: 'adjustment', amountIls: -50, date: '2026-09-12', label: 'עדכון יתרה', memberName: null,
  category: null, walletId: 'w-main', walletName: 'ארנק ראשי', note: 'עדכון יתרה', fromBank: false,
};

function render(focus: WalletsSheetFocus | null = null): string {
  return renderToStaticMarkup(
    createElement(WalletsSheet, { wallets, members: [], movements: [adjustment], focus, onClose: () => {} }),
  );
}

describe('WalletsSheet', () => {
  it('keeps the wallet name and its "default" tag apart (V1-05)', () => {
    const html = render();
    // The name sits in its own element, the tag in a separate pill, so they
    // can never run together as "ארנק ראשיברירת מחדל".
    expect(html).toContain('<span class="wallet-row-name">ארנק ראשי</span>');
    expect(html).toMatch(/<span class="wallet-tag">ברירת מחדל<\/span>/);
    expect(html).toMatch(/<span class="wallet-tag">שרה<\/span>/);
    expect(html).not.toContain('ארנק ראשיברירת מחדל');
  });

  it('opens a wallet straight into its settings, with every action (V1-04)', () => {
    const html = render({ walletId: 'w-main' });
    for (const label of ['הוספת כסף לארנק', 'לעדכן כמה כסף יש בארנק עכשיו', 'שינוי שם', 'להסיר את הארנק']) {
      expect(html).toContain(label);
    }
    // Already the default: no "make default" row.
    expect(html).not.toContain('להפוך לארנק ברירת המחדל');
    // This month's balance update is listed with an undo.
    expect(html).toContain('עדכוני יתרה החודש');
    expect(html).toContain('ביטול');

    expect(render({ walletId: 'w-sara' })).toContain('להפוך לארנק ברירת המחדל');
  });

  it('opens the add-money form when asked to', () => {
    const html = render({ walletId: 'w-main', panel: 'add' });
    expect(html).toContain('מאיפה הכסף?');
    expect(html).toContain('משיכה מהכספומט');
  });

  it('puts an "add money" action on the wallet card', () => {
    const html = renderToStaticMarkup(
      createElement(WalletCard, {
        wallet: { balance: 515, wallets, withdrawn: 0, income: 0, spent: 0, movements: [adjustment] },
        onAddMoney: () => {},
        onManage: () => {},
      }),
    );
    expect(html).toContain('הוספת כסף לארנק');
  });
});
