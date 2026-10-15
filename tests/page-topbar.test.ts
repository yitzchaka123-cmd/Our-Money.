import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AccountsView } from '@/app/accounts/AccountsView';
import { SettingsView } from '@/app/settings/SettingsView';

const accounts = renderToStaticMarkup(
  createElement(AccountsView, {
    data: { month: '2026-10', updated: null, lastSyncAt: null, accounts: [], cash: { balance: 0, walletCount: 1 } },
  }),
);
const settings = renderToStaticMarkup(
  createElement(SettingsView, {
    data: {
      preferredName: 'יצחק',
      telegramName: 'Nechemiah',
      members: [],
      accounts: [],
      lastSync: null,
      lastSyncAt: null,
      month: '2026-10',
      yearAgo: '2025-10',
    },
  }),
);

describe('the sync button on every page (V2-3)', () => {
  for (const [page, html] of [['accounts', accounts], ['settings', settings]] as const) {
    it(`${page}: a top bar with the back arrow and the same sync button as the dashboard`, () => {
      const bar = /<header class="appbar">([\s\S]*?)<\/header>/.exec(html)?.[1] ?? '';
      expect(bar).toContain('aria-label="חזרה"');
      expect(bar).toContain('href="/dashboard"');
      expect(bar).toContain('class="icon-btn sync-btn"');
      expect(bar).toContain('aria-label="סנכרון מ-RiseUp"');
    });
  }
});
