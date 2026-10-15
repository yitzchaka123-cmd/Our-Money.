import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WalletCard } from '@/app/dashboard/components/WalletCard';
import { WalletHistorySheet, WalletMenu, walletMenuItems } from '@/app/dashboard/components/WalletMenu';
import type { WalletView } from '@/lib/dashboard/data';

const wallet: WalletView = {
  balance: 515,
  wallets: [
    { id: 'w-main', name: 'ארנק ראשי', balance: 365, isDefault: true, memberName: null },
    { id: 'w-sara', name: 'הארנק של שרה', balance: 150, isDefault: false, memberName: 'שרה' },
  ],
  withdrawn: 400,
  income: 0,
  spent: 250,
  movements: [],
  inflow: { month: '2026-10', predicted: 1200, basis: ['2026-07', '2026-08', '2026-09'], override: null, expected: 1200, arrived: 400 },
  history: [
    { month: '2026-06', in: 0, out: 0 },
    { month: '2026-07', in: 1000, out: 640 },
    { month: '2026-08', in: 1700, out: 1210 },
    { month: '2026-09', in: 900, out: 830 },
    { month: '2026-10', in: 400, out: 250 },
  ],
};

describe("the wallet card's ⋮ menu (V2-13)", () => {
  it('offers what the income ⋮ offers, for cash, in that order', () => {
    expect(walletMenuItems(wallet).map((i) => i.label)).toEqual([
      'חודשים קודמים',
      'עדכון כמה צפוי להיכנס',
      'הוספת כסף לארנק',
      'העברה בין ארנקים',
      'ניהול ארנקים',
    ]);
  });

  it('with one wallet there is nothing to transfer between', () => {
    const one = { ...wallet, wallets: wallet.wallets.slice(0, 1) };
    expect(walletMenuItems(one).map((i) => i.action)).not.toContain('transfer');
  });

  it('renders as a sheet titled like the card', () => {
    const html = renderToStaticMarkup(createElement(WalletMenu, { wallet, onPick: () => {}, onClose: () => {} }));
    expect(html).toContain('ארנקי מזומן');
    expect(html).toContain('עדכון כמה צפוי להיכנס');
  });

  it('the card ⋮ is labelled as the wallet menu', () => {
    const html = renderToStaticMarkup(createElement(WalletCard, { wallet, onMenu: () => {} }));
    expect(html).toContain('aria-label="תפריט הארנק"');
  });
});

describe('previous months for cash (V2-13)', () => {
  it('draws five months of cash in and out, this month last, with the expected figure', () => {
    const html = renderToStaticMarkup(createElement(WalletHistorySheet, { wallet, onClose: () => {} }));
    for (const m of ['יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳']) expect(html).toContain(m);
    expect(html.match(/class="cash-bars-month"/g)).toHaveLength(5);
    expect(html).toContain('1,700');
    expect(html).toContain('1,210');
    expect(html).toContain('נכנס');
    expect(html).toContain('יצא');
    expect(html).toContain('צפוי להיכנס');
  });
});
