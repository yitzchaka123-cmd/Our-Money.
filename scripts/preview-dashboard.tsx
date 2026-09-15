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
    type: 'variable',
    title: 'הוצאות משתנות',
    actual: 161.7,
    expected: 161.7,
    showRemaining: false,
    actuals: [
      actual('v1', '2026-09-02', 40, 'BIT', { accountNumberHash: '0848' }),
      actual('v2', '2026-09-09', 92.1, 'שופרסל דיל', { accountNumberHash: '0848' }),
      actual('v3', '2026-09-15', 29.6, 'ארומה', { accountNumberHash: '0848' }),
    ],
  },
  {
    key: 'fixed',
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
    type: 'trackingCategory',
    title: 'אוכל בחוץ',
    actual: 74,
    expected: 500,
    showRemaining: true,
    actuals: [actual('t1', '2026-09-11', 74, 'מסעדת הגליל')],
  },
  {
    key: 'cash',
    type: 'cash',
    title: 'מזומן',
    actual: 1685,
    expected: 2200,
    showRemaining: true,
    actuals: [
      actual('c1', '2026-09-15', 85, 'מכולת בפינה', {
        accountNickname: 'יצחק',
        source: 'voice',
        categoryLabel: 'מזון וצריכה',
      }),
      actual('c2', '2026-09-14', 45, 'מונית הביתה', {
        accountNickname: 'שרה',
        categoryLabel: 'תחבורה ורכב',
      }),
      actual('c3', '2026-09-12', 120, 'ארוחת צהריים', {
        accountNickname: 'יצחק',
        source: 'voice',
        categoryLabel: 'מסעדות',
      }),
    ],
  },
  {
    key: 'cash-unlogged',
    type: 'cashUnlogged',
    title: 'מזומן שטרם נרשם',
    actual: 515,
    expected: 515,
    showRemaining: false,
    actuals: [],
  },
  {
    key: 'goal',
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
  forecast: -8478,
  variableRemaining: 0,
  totalActualExpenses: 4608,
  totalExpectedExpenses: 16114,
  envelopes,
  wallet: {
    toppedUp: 5400,
    logged: 4885,
    unaccounted: 515,
    topupCount: 7,
    spendCount: 41,
  },
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
<body>${renderToStaticMarkup(<DashboardView data={fixture} expandAll={expandAll} />)}</body>
</html>`;

writeFileSync(target, html);
console.log(`Wrote ${target}`);

export {};
