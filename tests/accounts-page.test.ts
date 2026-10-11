import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AccountsView, type AccountsPageData } from '@/app/accounts/AccountsView';
import { summarizeAccounts } from '@/lib/dashboard/accounts';

const data: AccountsPageData = {
  month: '2026-10',
  updated: '11.10.26, 11:20',
  accounts: summarizeAccounts({
    known: [
      { source: 'leumiBank', hash: 'bk0001', sourceType: 'bankAccount' },
      { source: 'leumicard', hash: 'cc5910' },
      { source: 'max', hash: 'mx7722' },
    ],
    monthRows: [
      { source: 'leumicard', hash: 'cc5910', amountIls: 60, isIncome: false },
      { source: 'leumicard', hash: 'cc5910', amountIls: 64.3, isIncome: false },
      { source: 'leumiBank', hash: 'bk0001', amountIls: 7635, isIncome: true },
    ],
    labels: [{ source: 'leumicard', accountNumberHash: 'cc5910', label: 'כרטיס 0848' }],
  }),
  cash: { balance: 515, walletCount: 2 },
};

describe('accounts page (V1-23)', () => {
  const html = renderToStaticMarkup(createElement(AccountsView, { data }));

  it('says once, honestly, that RiseUp shares no balances or limits', () => {
    expect(html).toContain('רייזאפ לא משתפים יתרות ומסגרות אשראי דרך החיבור');
    expect(html.match(/לא משתפים יתרות/g)).toHaveLength(1);
  });

  it('shows one card per account, banks and cards in their own sections', () => {
    expect(html).toContain('חשבונות בנק');
    expect(html).toContain('כרטיסי אשראי');
    expect(html.match(/class="card account-card"/g)).toHaveLength(4); // 3 accounts + cash
    expect(html).toContain('בנק לאומי');
    expect(html).toContain('מקס');
  });

  it('shows your name for a card, its provider, and this month’s charges and count', () => {
    expect(html).toContain('<p class="account-provider">כרטיס 0848</p>');
    expect(html).toContain('<p class="account-sub">לאומי קארד</p>');
    expect(html).toContain('חיובים באוקטובר · 2');
    expect(html).toContain('124');
    expect(html).toContain('מעודכן ל-11.10.26, 11:20');
  });

  it('offers to name an account that has no name yet', () => {
    expect(html).toContain('לתת שם לכרטיס');
    expect(html).toContain('לתת שם לחשבון');
    expect(html).not.toContain('cc5910');
  });
});
