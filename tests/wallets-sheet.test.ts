import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WalletsSheet } from '@/app/dashboard/components/WalletsSheet';
import type { WalletSummary } from '@/lib/dashboard/data';

const wallets: WalletSummary[] = [
  { id: 'w-main', name: 'ארנק ראשי', balance: 365, isDefault: true, memberName: null },
  { id: 'w-sara', name: 'הארנק של שרה', balance: 150, isDefault: false, memberName: 'שרה' },
];

function render(): string {
  return renderToStaticMarkup(
    createElement(WalletsSheet, { wallets, members: [], onClose: () => {} }),
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
});
