/**
 * Static previews of the wallets, accounts, settings, drawer and loading
 * screens, rendered from fixtures so they can be screenshotted without a
 * database or a session.
 *
 *   npx tsx scripts/preview-c.tsx <outdir>
 *
 * Writes one HTML file per screen; scripts/ui-shots-c.sh shoots them.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AccountsView } from '../app/accounts/AccountsView';
import { DrawerContent } from '../app/dashboard/components/Shell';
import { WalletsSheet } from '../app/dashboard/components/WalletsSheet';
import { summarizeAccounts } from '../lib/dashboard/accounts';
import type { WalletMovement, WalletSummary } from '../lib/dashboard/data';

const wallets: WalletSummary[] = [
  { id: 'w-main', name: 'ארנק ראשי', balance: 365, isDefault: true, memberName: null },
  { id: 'w-sara', name: 'הארנק של שרה', balance: 150, isDefault: false, memberName: 'שרה' },
  { id: 'w-safe', name: 'הכספת', balance: 0, isDefault: false, memberName: null },
];
const movements: WalletMovement[] = [
  { id: 'a1', kind: 'adjustment', amountIls: -50, date: '2026-10-09', label: 'עדכון יתרה', memberName: 'יצחק', category: null, walletId: 'w-main', walletName: 'ארנק ראשי', note: 'עדכון יתרה', fromBank: false },
];
const members = [
  { id: 'm1', display_name: 'יצחק' },
  { id: 'm2', display_name: 'שרה' },
];

const accounts = summarizeAccounts({
  known: [
    { source: 'leumiBank', hash: 'bk0001', sourceType: 'bankAccount' },
    { source: 'leumicard', hash: 'cc5910' },
    { source: 'max', hash: 'mx7722' },
  ],
  monthRows: [
    { source: 'leumicard', hash: 'cc5910', amountIls: 60, isIncome: false },
    { source: 'leumicard', hash: 'cc5910', amountIls: 64.3, isIncome: false },
    { source: 'max', hash: 'mx7722', amountIls: 2515.2, isIncome: false },
    { source: 'leumiBank', hash: 'bk0001', amountIls: 3493.6, isIncome: false },
    { source: 'leumiBank', hash: 'bk0001', amountIls: 7635, isIncome: true },
  ],
  labels: [{ source: 'leumicard', accountNumberHash: 'cc5910', label: 'כרטיס 0848' }],
});

export const screens: Record<string, () => ReactElement> = {
  wallets: () => <WalletsSheet wallets={wallets} members={members} movements={movements} onClose={() => {}} />,
  'wallet-settings': () => (
    <WalletsSheet wallets={wallets} members={members} movements={movements} focus={{ walletId: 'w-main' }} onClose={() => {}} />
  ),
  'wallet-add': () => (
    <WalletsSheet wallets={wallets} members={members} movements={movements} focus={{ walletId: 'w-main', panel: 'add' }} onClose={() => {}} />
  ),
  'wallet-set': () => (
    <WalletsSheet wallets={wallets} members={members} movements={movements} focus={{ walletId: 'w-sara', panel: 'set' }} onClose={() => {}} />
  ),
  drawer: () => (
    <>
      <div className="scrim" />
      <aside className="drawer">
        <DrawerContent userName="יצחק אברגל" lastUpdated="11.10 11:20" briefCount={2} onOpenWallets={() => {}} />
      </aside>
    </>
  ),
  accounts: () => (
    <AccountsView data={{ month: '2026-10', updated: '11.10.26, 11:20', accounts, cash: { balance: 515, walletCount: 3 } }} />
  ),
};

const root = process.cwd();
const css = ['app/globals.css', 'app/wallets-accounts.css'].map((f) => readFileSync(join(root, f), 'utf8')).join('\n');
const out = process.argv[2] ?? '.shots';
mkdirSync(out, { recursive: true });

for (const [name, render] of Object.entries(screens)) {
  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${name}</title>
<style>${css}</style>
</head>
<body>${renderToStaticMarkup(render())}</body>
</html>`;
  writeFileSync(join(out, `${name}.html`), html);
}
console.log(`Wrote ${Object.keys(screens).length} previews to ${out}`);
