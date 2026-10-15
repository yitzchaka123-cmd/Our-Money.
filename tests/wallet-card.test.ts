import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WalletCard } from '@/app/dashboard/components/WalletCard';
import type { WalletView } from '@/lib/dashboard/data';

const noop = () => {};

function walletView(overrides: Partial<WalletView> = {}): WalletView {
  return {
    balance: 515,
    wallets: [
      { id: 'w-main', name: 'ארנק ראשי', balance: 365, isDefault: true, memberName: null },
      { id: 'w-sara', name: 'הארנק של שרה', balance: 150, isDefault: false, memberName: 'שרה' },
    ],
    withdrawn: 1200,
    income: 350,
    spent: 250,
    movements: [],
    ...overrides,
  };
}

function render(wallet: WalletView = walletView(), extra: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(WalletCard, {
      wallet,
      onAddMoney: noop,
      onAddSpend: noop,
      onAddWithdrawal: noop,
      onManage: noop,
      onOpenWallet: noop,
      ...extra,
    }),
  );
}

/** The icon element right before a button's label. */
function iconBefore(html: string, label: string): string {
  const at = html.indexOf(`<span>${label}</span>`);
  expect(at, label).toBeGreaterThan(-1);
  const start = html.lastIndexOf('<span class="add-plus', at);
  return html.slice(start, at);
}

describe('wallet card buttons (V2-04)', () => {
  it('money in is a green plus, a cash expense a red minus, an ATM withdrawal a purple plus', () => {
    const html = render();
    expect(iconBefore(html, 'הוספת כסף לארנק')).toMatch(/add-plus--income[^>]*>\+</);
    expect(iconBefore(html, 'הוספת הוצאה במזומן')).toMatch(/add-plus--spend[^>]*>−</);
    expect(iconBefore(html, 'רישום משיכה מהכספומט')).toMatch(/add-plus--withdrawal[^>]*>\+</);
  });

  it('lists the buttons in the order the card reads: add money, expense, withdrawal', () => {
    const html = render();
    const order = ['הוספת כסף לארנק', 'הוספת הוצאה במזומן', 'רישום משיכה מהכספומט'].map((l) => html.indexOf(l));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('has no separate "add cash income" button — income is reached through adding money', () => {
    expect(render()).not.toContain('הוספת הכנסה במזומן');
  });
});

describe('wallets as tiles (V2-07)', () => {
  const several = walletView({
    balance: -740,
    wallets: [
      { id: 'w-main', name: 'ארנק ראשי', balance: -890, isDefault: true, memberName: null },
      { id: 'w-test', name: 'Test', balance: 150, isDefault: false, memberName: 'שרה' },
    ],
  });

  it('draws one tile per wallet: its name, its balance, and a "default" pill on the default only', () => {
    const html = render(several);
    const tiles = html.match(/<button[^>]*class="wallet-tile"[\s\S]*?<\/button>/g) ?? [];
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toContain('<span class="wallet-tile-name">ארנק ראשי</span>');
    expect(tiles[0]).toContain('<span class="wallet-tag">ברירת מחדל</span>');
    expect(tiles[1]).toContain('<span class="wallet-tile-name">Test</span>');
    expect(tiles[1]).not.toContain('ברירת מחדל');
  });

  it('shows a negative balance in red', () => {
    const html = render(several);
    expect(html).toMatch(/aria-label="הגדרות ארנק ראשי"[\s\S]*?wallet-tile-balance is-negative/);
    expect(html).toMatch(/aria-label="הגדרות Test"[\s\S]*?class="amount wallet-tile-balance"/);
  });

  it('taps open that wallet', () => {
    // The tile is a button labelled for the wallet's settings.
    expect(render(several)).toContain('aria-label="הגדרות Test"');
  });

  it('no longer lists wallets as text rows', () => {
    expect(render(several)).not.toContain('wallet-list');
  });
});

describe('the list under the wallet card (V2-04)', () => {
  it('shows the expense button once, on the card, and no duplicate income button', async () => {
    const { EnvelopeList } = await import('@/app/dashboard/components/EnvelopeList');
    const html = renderToStaticMarkup(
      createElement(EnvelopeList, {
        envelopes: [],
        envelopeChoices: [],
        savingsEnvelopeId: null,
        wallet: walletView(),
        members: [],
        months: ['2026-09'],
        sessionMemberId: null,
        month: '2026-09',
        today: '2026-09-15',
        totalActualExpenses: 0,
        totalExpectedExpenses: 0,
      }),
    );
    expect(html.split('הוספת הוצאה במזומן').length - 1).toBe(1);
    expect(html).not.toContain('הוספת הכנסה במזומן');
  });
});
