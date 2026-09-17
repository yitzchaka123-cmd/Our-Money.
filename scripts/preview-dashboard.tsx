/**
 * Render the dashboard to a static HTML file with fixture data, so the layout
 * can be opened or screenshotted without a database, a session, or a deploy.
 *
 *   npx tsx scripts/preview-dashboard.tsx /tmp/dashboard.html
 *
 * It renders the same `DashboardView` the live page renders. The fixture
 * mirrors the figures in the reference screenshots (docs/riseup-ui-spec.md) so
 * the output can be compared against them side by side.
 */

import { writeFileSync, readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import { DashboardView } from '../app/dashboard/view';
import type { DashboardData, EnvelopeView } from '../lib/dashboard/data';
import type { NormalizedActual } from '../lib/riseup/envelopes';

function actual(
  id: string,
  date: string,
  amount: number,
  businessName: string,
  extra: Partial<NormalizedActual> = {},
): NormalizedActual {
  return {
    transactionId: id,
    transactionDate: date,
    billingDate: date,
    businessName,
    amountIls: amount,
    isIncome: false,
    accountNickname: null,
    accountNumberHash: null,
    source: null,
    isInstallment: false,
    paymentNumber: null,
    totalPayments: null,
    categoryLabel: null,
    ...extra,
  };
}

const envelopes: EnvelopeView[] = [
  {
    key: 'variable',
    envelopeId: 'variable',
    type: 'variable',
    title: 'הוצאות משתנות',
    actual: 291.7,
    expected: 291.7,
    showRemaining: false,
    actuals: [
      actual('v1', '2026-09-02', 40, 'BIT', { accountNumberHash: '0848' }),
      actual('v2', '2026-09-09', 92.1, 'שופרסל דיל', { accountNumberHash: '0848' }),
      actual('v3', '2026-09-15', 29.6, 'ארומה', { accountNumberHash: '0848' }),
      actual('cash:c1', '2026-09-15', 85, 'מכולת בפינה', {
        accountNickname: 'מזומן',
        source: 'cash',
        categoryLabel: 'מזון וצריכה',
        cash: { id: 'c1', kind: 'spend', memberName: 'יצחק', inputKind: 'voice', status: 'confirmed', walletId: 'w-main' },
      }),
      actual('cash:c2', '2026-09-14', 45, 'מונית הביתה', {
        accountNickname: 'מזומן',
        source: 'cash',
        categoryLabel: 'תחבורה',
        cash: { id: 'c2', kind: 'spend', memberName: 'שרה', inputKind: 'text', status: 'needs_review', walletId: 'w-sara' },
      }),
    ],
  },
  {
    key: 'fixed',
    envelopeId: 'fixed',
    type: 'fixed',
    title: 'הוצאות קבועות',
    actual: 3077,
    expected: 4968.3,
    showRemaining: false,
    actuals: [
      actual('f1', '2026-09-03', 74.8, 'הראל חיים', {
        accountNumberHash: '7722',
        categoryLabel: 'ביטוח',
      }),
      actual('f2', '2026-09-04', 1842.4, 'בנק לאומי', { categoryLabel: 'הלוואה' }),
      actual('f3', '2026-09-06', 574.3, 'חברת חשמל', { categoryLabel: 'חשמל' }),
      actual('f4', '2026-09-08', 585.5, 'עיריית ירושלים', { categoryLabel: 'ארנונה' }),
    ],
  },
  {
    key: 'income',
    envelopeId: 'income',
    type: 'variableIncome',
    title: 'הכנסות',
    actual: 7635,
    expected: 7635,
    showRemaining: false,
    actuals: [
      actual('i1', '2026-09-04', 7635, 'בנק הפועלים חשבון 674-1908922', {
        isIncome: true,
      }),
    ],
  },
  {
    key: 'track-food',
    envelopeId: 'track-food',
    type: 'trackingCategory',
    title: 'אוכל בחוץ',
    actual: 194,
    expected: 500,
    showRemaining: true,
    actuals: [
      actual('t1', '2026-09-11', 74, 'מסעדת הגליל'),
      actual('cash:c3', '2026-09-12', 120, 'ארוחת צהריים', {
        accountNickname: 'מזומן',
        source: 'cash',
        categoryLabel: 'אוכל בחוץ',
        cash: { id: 'c3', kind: 'spend', memberName: 'יצחק', inputKind: 'voice', status: 'confirmed', walletId: 'w-main' },
      }),
    ],
  },
  {
    key: 'cash-income',
    envelopeId: 'cash-income',
    type: 'cashIncome',
    title: 'הכנסות במזומן',
    actual: 350,
    expected: 350,
    showRemaining: false,
    actuals: [
      actual('ci1', '2026-09-10', 350, 'מתנה מסבתא', {
        isIncome: true,
        accountNickname: 'מזומן',
        source: 'cash',
        categoryLabel: 'מתנה',
        cash: { id: 'ci1', kind: 'income', memberName: 'שרה', inputKind: 'web', status: 'confirmed', walletId: 'w-main' },
      }),
    ],
  },
  {
    key: 'goal',
    envelopeId: 'goal',
    type: 'riseupGoal',
    title: 'הפקדות לחיסכון',
    actual: 0,
    expected: 1000,
    showRemaining: true,
    actuals: [],
  },
];

const fixture: DashboardData = {
  month: '2026-09',
  months: ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06'],
  userName: 'יצחק אברגל',
  greeting: 'יצחק',
  lastUpdated: '15.09 7:36',
  lastSyncAt: '2026-09-15T04:36:00Z',
  forecast: -8478,
  variableRemaining: 0,
  totalActualExpenses: 4608,
  totalExpectedExpenses: 16114,
  envelopes,
  envelopeChoices: [
    { envelopeId: 'variable', type: 'variable', name: 'הוצאות משתנות' },
    { envelopeId: 'fixed', type: 'fixed', name: 'הוצאות קבועות', categoryLabels: ['ביטוח', 'הלוואה'] },
    { envelopeId: 'track-food', type: 'trackingCategory', name: 'אוכל בחוץ' },
  ],
  savingsEnvelopeId: 'goal',
  wallet: {
    balance: 515,
    wallets: [
      { id: 'w-main', name: 'ארנק ראשי', balance: 365, isDefault: true, memberName: null },
      { id: 'w-sara', name: 'הארנק של שרה', balance: 150, isDefault: false, memberName: 'שרה' },
    ],
    withdrawn: 2200,
    income: 350,
    spent: 250,
    movements: [
      { id: 'w1', kind: 'withdrawal', amountIls: 1200, date: '2026-09-14', label: 'משיכת מזומן', memberName: null, category: null, walletId: 'w-main', walletName: 'ארנק ראשי' },
      { id: 'x1', kind: 'transfer', amountIls: 200, date: '2026-09-14', label: 'ארנק ראשי ← הארנק של שרה', memberName: 'יצחק', category: null, walletId: 'w-sara', walletName: 'הארנק של שרה' },
      { id: 'c1', kind: 'spend', amountIls: 85, date: '2026-09-15', label: 'מכולת בפינה', memberName: 'יצחק', category: 'מזון וצריכה', walletId: 'w-main', walletName: 'ארנק ראשי' },
      { id: 'ci1', kind: 'income', amountIls: 350, date: '2026-09-10', label: 'מתנה מסבתא', memberName: 'שרה', category: 'מתנה', walletId: 'w-sara', walletName: 'הארנק של שרה' },
    ],
  },
  members: [
    { id: 'm1', display_name: 'יצחק' },
    { id: 'm2', display_name: 'שרה' },
  ],
  briefCount: 8,
};

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const target = process.argv[2] ?? 'dashboard-preview.html';
const expandAll = process.argv[3] === 'expanded';

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Our Money — preview</title>
<style>${css}</style>
</head>
<body>${renderToStaticMarkup(<DashboardView data={fixture} sessionMemberId="m1" expandAll={expandAll} />)}</body>
</html>`;

writeFileSync(target, html);
console.log(`Wrote ${target}`);

export {};
