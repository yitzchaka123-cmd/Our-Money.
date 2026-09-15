/**
 * Render the dashboard to a static HTML file with fixture data, so the layout
 * can be opened or screenshotted without a database, a session, or a deploy.
 *
 *   npx tsx scripts/preview-dashboard.tsx /tmp/dashboard.html
 *
 * It renders the same `DashboardView` the live page renders — a mock-up kept
 * separately would drift from the real thing within a week.
 */

import { writeFileSync, readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import { DashboardView } from '../app/dashboard/view';
import type { DashboardData } from '../lib/dashboard/data';

const fixture: DashboardData = {
  month: '2026-09',
  availableMonths: ['2026-09', '2026-08', '2026-07'],
  income: 24800,
  bankSpending: 14320.4,
  cashLogged: 1685,
  withdrawnThisMonth: 2200,
  unloggedThisMonth: 515,
  totalSpending: 16520.4,
  net: 8279.6,
  walletNow: {
    toppedUp: 5400,
    logged: 4885,
    unaccounted: 515,
    topupCount: 7,
    spendCount: 41,
  },
  categories: [
    { label: 'מזון וצריכה', bank: 3420.5, cash: 640, total: 4060.5 },
    { label: 'בית ותחזוקה', bank: 3800, cash: 0, total: 3800 },
    { label: 'תחבורה ורכב', bank: 1950, cash: 310, total: 2260 },
    { label: 'חינוך וילדים', bank: 1880, cash: 120, total: 2000 },
    { label: 'מסעדות', bank: 740, cash: 385, total: 1125 },
    { label: 'בריאות', bank: 910, cash: 60, total: 970 },
    { label: 'מזומן שטרם נרשם', bank: 0, cash: 515, total: 515 },
    { label: 'ביגוד והנעלה', bank: 420, cash: 0, total: 420 },
    { label: 'פנאי ובידור', bank: 280, cash: 90, total: 370 },
    { label: 'טיפוח', bank: 120, cash: 80, total: 200 },
  ],
  recentCash: [
    { id: '1', amount: 85, category: 'מזון וצריכה', note: 'מכולת בפינה', spentAt: todayIso(), memberName: 'יצחק', inputKind: 'voice', status: 'confirmed' },
    { id: '2', amount: 45, category: 'תחבורה ורכב', note: 'מונית הביתה', spentAt: todayIso(), memberName: 'שרה', inputKind: 'text', status: 'confirmed' },
    { id: '3', amount: 120, category: 'מסעדות', note: 'ארוחת צהריים', spentAt: daysAgo(1), memberName: 'יצחק', inputKind: 'voice', status: 'needs_review' },
    { id: '4', amount: 60, category: 'חינוך וילדים', note: 'ציוד לגן', spentAt: daysAgo(1), memberName: 'שרה', inputKind: 'text', status: 'confirmed' },
    { id: '5', amount: 30, category: 'טיפוח', note: null, spentAt: daysAgo(2), memberName: 'יצחק', inputKind: 'text', status: 'confirmed' },
    { id: '6', amount: 200, category: 'מזון וצריכה', note: 'שוק', spentAt: daysAgo(4), memberName: 'שרה', inputKind: 'voice', status: 'confirmed' },
  ],
  lastSyncAt: new Date().toISOString(),
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const theme = process.argv[3] === 'dark' ? 'dark' : 'light';
const target = process.argv[2] ?? 'dashboard-preview.html';

const html = `<!doctype html>
<html lang="he" dir="rtl" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Our Money — preview</title>
<style>${css}</style>
</head>
<body>${renderToStaticMarkup(<DashboardView data={fixture} />)}</body>
</html>`;

writeFileSync(target, html);
console.log(`Wrote ${target} (${theme})`);

export {};
