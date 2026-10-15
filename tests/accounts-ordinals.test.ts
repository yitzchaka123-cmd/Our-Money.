import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AccountsView, type AccountsPageData } from '@/app/accounts/AccountsView';
import { summarizeAccounts } from '@/lib/dashboard/accounts';

/**
 * V2-3. The live data has two Leumi Card cards, neither with a name of its
 * own (codes b61d6c and cc5910), and the accounts page showed both as
 * "לאומי קארד". They read as everywhere else in the app: numbered by code.
 */
function page(labels: Array<{ source: string; accountNumberHash: string; label: string }>): string {
  const data: AccountsPageData = {
    month: '2026-10',
    updated: '15.10.26, 20:40',
    accounts: summarizeAccounts({
      known: [
        { source: 'leumiBank', hash: 'c81bcf' },
        { source: 'leumicard', hash: 'cc5910' },
        { source: 'leumicard', hash: 'b61d6c' },
      ],
      monthRows: [
        { source: 'leumicard', hash: 'b61d6c', amountIls: 448.55, isIncome: false },
        { source: 'leumicard', hash: 'cc5910', amountIls: 60, isIncome: false },
      ],
      labels,
    }),
    cash: { balance: 0, walletCount: 1 },
  };
  return renderToStaticMarkup(createElement(AccountsView, { data }));
}

describe('accounts page names two cards of one provider apart (V2-3)', () => {
  it('numbers them "לאומי קארד 1 / 2", as the rest of the app does', () => {
    const html = page([]);
    expect(html).toContain('<p class="account-provider">לאומי קארד 1</p>');
    expect(html).toContain('<p class="account-provider">לאומי קארד 2</p>');
    expect(html).not.toContain('<p class="account-provider">לאומי קארד</p>');
  });

  it('keeps your own name first, and the other card then needs no number', () => {
    const html = page([{ source: 'leumicard', accountNumberHash: 'cc5910', label: 'כרטיס 0848' }]);
    expect(html).toContain('<p class="account-provider">כרטיס 0848</p>');
    expect(html).toContain('<p class="account-sub">לאומי קארד</p>');
    expect(html).toContain('<p class="account-provider">לאומי קארד</p>');
  });
});
