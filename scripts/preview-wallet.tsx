/**
 * Render the wallet card and its sheets to static HTML, for screenshots:
 *
 *   npx tsx scripts/preview-wallet.tsx out.html [mode]
 *
 * Modes: card (default), open (movements listed), menu, history, inflow,
 * withdrawal, add-withdrawal, movement, income-kind (the transaction sheet's
 * "איזו הכנסה זו?"), income-new (a new cash income), add-income.
 * Shoot with scripts/wallet-shots.sh.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CashEntrySheet, emptyDraft } from '../app/dashboard/components/CashEntrySheet';
import { IncomeKindSheet } from '../app/dashboard/components/IncomeKind';
import { WalletMovementSheet } from '../app/dashboard/components/WalletMovementSheet';
import { WalletSection } from '../app/dashboard/components/WalletSection';
import { WalletSettingsSheet } from '../app/dashboard/components/WalletSettingsSheet';
import type { WalletMovement, WalletView } from '../lib/dashboard/data';
import type { NormalizedActual } from '../lib/riseup/envelopes';

const movements: WalletMovement[] = [
  { id: 'a1', kind: 'adjustment', amountIls: 3540, date: '2026-10-15', label: 'הוספת כסף לארנק', memberName: 'יצחק', memberId: 'm1', category: null, walletId: 'w-main', walletName: 'ארנק ראשי', note: 'הוספת כסף לארנק', fromBank: false },
  { id: 's1', kind: 'spend', amountIls: 845, date: '2026-10-11', label: 'סיבוניס', memberName: 'יצחק', memberId: 'm1', category: 'אחר', walletId: 'w-main', walletName: 'ארנק ראשי', note: 'סיבוניס', fromBank: false },
  { id: 's2', kind: 'spend', amountIls: 45, date: '2026-10-10', label: 'סופר', memberName: 'יצחק', memberId: 'm1', category: 'סופר', walletId: 'w-main', walletName: 'ארנק ראשי', note: null, fromBank: false },
  { id: 'w1', kind: 'withdrawal', amountIls: 500, date: '2026-10-09', label: 'משיכת מזומן', memberName: null, memberId: null, category: 'משיכה', walletId: 'w-main', walletName: 'ארנק ראשי', note: null, fromBank: true },
  { id: 'i1', kind: 'income', amountIls: 600, date: '2026-10-08', label: 'שיעורים פרטיים', memberName: 'שרה', memberId: 'm2', category: 'שיעורים פרטיים', walletId: 'w-test', walletName: 'Test', note: null, fromBank: false },
];

export const wallet: WalletView = {
  balance: 2650,
  wallets: [
    { id: 'w-main', name: 'ארנק ראשי', balance: 2650, isDefault: true, memberName: null },
    { id: 'w-test', name: 'Test', balance: -120, isDefault: false, memberName: null },
    { id: 'w-sara', name: 'הארנק של שרה', balance: 120, isDefault: false, memberName: 'שרה' },
  ],
  withdrawn: 500,
  income: 600,
  spent: 890,
  movements,
  inflow: { month: '2026-10', predicted: 1433, basis: ['2026-07', '2026-08', '2026-09'], override: null, expected: 1433, arrived: 1100 },
  history: [
    { month: '2026-06', in: 0, out: 120 },
    { month: '2026-07', in: 1000, out: 640 },
    { month: '2026-08', in: 2400, out: 1210 },
    { month: '2026-09', in: 900, out: 830 },
    { month: '2026-10', in: 1100, out: 890 },
  ],
};

const categories = ['משכורת', 'דיור', 'קצבאות', 'שיעורים פרטיים', 'מתנה'];
const incomeActual: NormalizedActual = {
  transactionId: 'cash-income:i1', transactionDate: '2026-10-08', billingDate: '2026-10-08', businessName: 'שיעורים פרטיים', amountIls: 600,
  isIncome: true, accountNickname: 'מזומן', accountNumberHash: null, source: 'cash', isInstallment: false, paymentNumber: null,
  totalPayments: null, categoryLabel: 'שיעורים פרטיים',
  cash: { id: 'i1', kind: 'income', memberId: 'm2', memberName: 'שרה', inputKind: 'web', status: 'confirmed', walletId: 'w-test', incomeKind: 'fixed' },
};

const mode = process.argv[3] ?? 'card';
const noop = () => {};

function overlay(): ReactNode {
  switch (mode) {
    case 'withdrawal':
      return <CashEntrySheet open draft={{ ...emptyDraft('withdrawal', 'm1'), amountIls: 500 }} envelopes={[]} members={[]} wallets={wallet.wallets} onClose={noop} />;
    case 'add-withdrawal':
      return <WalletSettingsSheet wallet={wallet.wallets[0]!} wallets={wallet.wallets} initialPanel="add" initialSource="withdrawal" onClose={noop} />;
    case 'income-kind':
      return <IncomeKindSheet actual={incomeActual} choices={categories} onClose={noop} />;
    case 'income-new':
      return <CashEntrySheet open draft={{ ...emptyDraft('income', 'm1'), amountIls: 2000, incomeKind: 'fixed', category: 'משכורת' }} envelopes={[]} members={[]} wallets={wallet.wallets} incomeCategories={categories} onClose={noop} />;
    case 'add-income':
      return <WalletSettingsSheet wallet={wallet.wallets[0]!} wallets={wallet.wallets} incomeCategories={categories} initialPanel="add" initialSource="income" onClose={noop} />;
    case 'movement':
      return <WalletMovementSheet movement={movements[0]!} onClose={noop} onAction={noop} onEdit={noop} onDelete={noop} onOpenWallet={noop} />;
    default:
      return null;
  }
}

const sheet = mode === 'menu' || mode === 'history' || mode === 'inflow' ? mode : null;

const css = ['../app/globals.css', '../app/assistant-and-setup.css', '../app/wallets-accounts.css', '../app/brief-insights.css', '../app/dashboard/trackers-search.css', '../app/dashboard/forecast-sheet.css']
  .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
  .join('\n');

// The card's movement list opens on tap; for the "open" shot it is drawn open.
const card = renderToStaticMarkup(
  <WalletSection wallet={wallet} onManage={noop} onAddMoney={noop} onAddSpend={noop} onAddWithdrawal={noop} onOpenWallet={noop} onOpenMovement={noop} initialSheet={sheet} />,
);
const body = renderToStaticMarkup(<>{overlay()}</>);

writeFileSync(
  process.argv[2] ?? 'wallet-preview.html',
  `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>wallet preview</title><style>${css}</style></head><body><div class="app"><div class="section">${card}</div></div>${body}</body></html>`,
);
