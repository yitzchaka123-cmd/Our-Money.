import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CashEntrySheet, emptyDraft } from '@/app/dashboard/components/CashEntrySheet';
import { WalletSettingsSheet } from '@/app/dashboard/components/WalletSettingsSheet';
import type { WalletSummary } from '@/lib/dashboard/data';

const main: WalletSummary = { id: 'w-main', name: 'ארנק ראשי', balance: 365, isDefault: true, memberName: null };
const test: WalletSummary = { id: 'w-test', name: 'Test', balance: 0, isDefault: false, memberName: null };

/** The chip for a wallet, and whether it is the one picked. */
function chip(html: string, name: string): string | undefined {
  return html.match(new RegExp(`<button[^>]*class="chip"[^>]*>${name}</button>`))?.[0];
}

describe('recording an ATM withdrawal asks which wallet (V2-06a)', () => {
  it('the cash entry sheet asks, with the default wallet picked', () => {
    const html = renderToStaticMarkup(
      createElement(CashEntrySheet, {
        open: true,
        draft: emptyDraft('withdrawal', 'm1'),
        envelopes: [],
        members: [],
        wallets: [test, main],
        onClose: () => {},
      }),
    );
    expect(html).toContain('לאיזה ארנק נכנס הכסף?');
    expect(chip(html, 'ארנק ראשי')).toContain('data-selected="true"');
    expect(chip(html, 'Test')).toContain('data-selected="false"');
  });

  it('asks even when there is only one wallet', () => {
    const html = renderToStaticMarkup(
      createElement(CashEntrySheet, {
        open: true,
        draft: emptyDraft('withdrawal', 'm1'),
        envelopes: [],
        members: [],
        wallets: [main],
        onClose: () => {},
      }),
    );
    expect(html).toContain('לאיזה ארנק נכנס הכסף?');
    expect(chip(html, 'ארנק ראשי')).toContain('data-selected="true"');
  });

  it('a spend with one wallet does not ask', () => {
    const html = renderToStaticMarkup(
      createElement(CashEntrySheet, {
        open: true,
        draft: emptyDraft('spend', 'm1'),
        envelopes: [],
        members: [],
        wallets: [main],
        onClose: () => {},
      }),
    );
    expect(html).not.toContain('מאיזה ארנק');
  });

  it('adding money from the ATM in a wallet\'s settings asks which wallet, this one picked', () => {
    const html = renderToStaticMarkup(
      createElement(WalletSettingsSheet, {
        wallet: main,
        wallets: [main, test],
        initialPanel: 'add',
        initialSource: 'withdrawal',
        onClose: () => {},
      }),
    );
    expect(html).toContain('לאיזה ארנק נכנס הכסף?');
    expect(chip(html, 'ארנק ראשי')).toContain('data-selected="true"');
    expect(chip(html, 'Test')).toContain('data-selected="false"');
  });

  it('other sources do not ask: the money goes into the wallet that is open', () => {
    const html = renderToStaticMarkup(
      createElement(WalletSettingsSheet, {
        wallet: main,
        wallets: [main, test],
        initialPanel: 'add',
        initialSource: 'other',
        onClose: () => {},
      }),
    );
    expect(html).not.toContain('לאיזה ארנק נכנס הכסף?');
  });
});
