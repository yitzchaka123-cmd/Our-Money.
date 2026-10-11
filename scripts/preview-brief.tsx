/**
 * Render the dashboard with the daily brief and the insight cards to static
 * HTML, from fixtures, in one of several states — so each can be
 * screenshotted next to RiseUp's (see scripts/brief-shots.sh).
 *
 *   npx tsx scripts/preview-brief.tsx out.html <mode>
 *
 * Modes: top (insight carousel + blob), intro, item, cash, end, popup.
 * The brief and the cards are built by the real rules (lib/dashboard/brief.ts,
 * lib/dashboard/insights.ts) from the fixture rows below.
 */

import { setupSteps } from '../lib/dashboard/steps';
import { readFileSync, writeFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import { DashboardView } from '../app/dashboard/view';
import { buildBrief, type BriefEnvelope, type RiseupRow } from '../lib/dashboard/brief';
import type { DashboardData, EnvelopeView } from '../lib/dashboard/data';
import { computeInsights } from '../lib/dashboard/insights';
import type { NormalizedActual } from '../lib/riseup/envelopes';
import type { CashSpend } from '../lib/types';

function actual(id: string, date: string, amount: number, business: string, extra: Partial<NormalizedActual> = {}): NormalizedActual {
  return {
    transactionId: id,
    transactionDate: date,
    billingDate: date,
    businessName: business,
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

const ELEC = 'בזק (ENERGY בזק ג׳ן)';
const cashTaxi = actual('cash:s1', '2026-10-07', 45, 'מונית הביתה', {
  accountNickname: 'מזומן',
  source: 'cash',
  categoryLabel: 'תחבורה',
  cash: { id: 's1', kind: 'spend', memberName: 'שרה', inputKind: 'voice', status: 'confirmed', walletId: 'w-main' },
});

const envelopes: EnvelopeView[] = [
  {
    key: 'var', envelopeId: 'var', type: 'variable', title: 'הוצאות משתנות', actual: 1975, expected: 3000, showRemaining: false,
    pending: [
      { planId: 'p1', kind: 'spend', amountIls: 800, date: '2026-10-20', label: 'עוזרת בית', category: 'ניקיון', note: 'עוזרת בית', memberName: null, memberId: null, walletId: 'w-main', recurrence: 'monthly', envelopeId: 'var' },
    ],
    pendingTotal: 800,
    actuals: [actual('v1', '2026-10-11', 1450, 'מחסני חשמל', { accountNumberHash: '0848' }), actual('v2', '2026-10-09', 480, 'שופרסל דיל'), cashTaxi],
  },
  {
    key: 'fix', envelopeId: 'fix', type: 'fixed', title: 'הוצאות קבועות', actual: 768.99, expected: 5768, showRemaining: false, pending: [], pendingTotal: 0,
    actuals: [actual('elec', '2026-10-06', 768.99, ELEC, { categoryLabel: 'חשמל', accountNumberHash: '7722' })],
  },
  {
    key: 'inc', envelopeId: 'inc', type: 'variableIncome', title: 'הכנסות', actual: 7635, expected: 7635, showRemaining: false, pending: [], pendingTotal: 0,
    actuals: [actual('salary', '2026-10-08', 7635, 'העברת משכורת', { isIncome: true, accountNumberHash: '674-1908922' })],
  },
  {
    key: 'pharm', envelopeId: 'pharm', type: 'trackingCategory', title: 'פארמה', actual: 300, expected: 450, showRemaining: true, pending: [], pendingTotal: 0,
    actuals: [actual('ph1', '2026-10-03', 300, 'סופר-פארם')],
  },
];

const briefEnvelopes: BriefEnvelope[] = envelopes.map((e) => ({
  envelopeId: e.envelopeId!, type: e.type, title: e.title, planned: e.key === 'pharm' ? 450 : e.expected, actuals: e.actuals,
}));

const row = (id: string, date: string, amount: number, business: string, seen: string, extra: Partial<RiseupRow> = {}): RiseupRow => ({
  transaction_id: id, transaction_date: date, cashflow_month: '2026-10', business_name: business, amount_ils: amount, is_income: false,
  account_nickname: null, account_number_hash: '7722', category_label: null, is_withdrawal: false, first_seen_at: seen, ...extra,
});

const taxi: CashSpend = {
  id: 's1', member_id: 'm2', amount_ils: 45, category: 'תחבורה', note: 'מונית הביתה', spent_at: '2026-10-07', status: 'needs_review',
  confidence: 'low', input_kind: 'voice', raw_input: null, transcript: null, telegram_update_id: null, telegram_chat_id: null,
  telegram_message_id: null, bot_message_id: null, envelope_id: 'var', envelope_type: 'variable', wallet_id: 'w-main', created_at: '2026-10-07T18:00:00Z',
};

const brief = buildBrief({
  asOf: '2026-10-11T08:00:00Z',
  seenUntil: '2026-10-05T20:00:00Z',
  newRiseup: [
    row('elec', '2026-10-06', 768.99, ELEC, '2026-10-07T05:00:00Z', { category_label: 'חשמל' }),
    row('salary', '2026-10-08', 7635, 'העברת משכורת', '2026-10-09T05:00:00Z', { is_income: true, account_number_hash: '674-1908922' }),
  ],
  history: [
    { id: 'h0', date: '2026-04-02', business: 'ישן', amount: 10, isIncome: false },
    { id: 'h1', date: '2026-07-06', business: ELEC, amount: 690, isIncome: false },
    { id: 'h2', date: '2026-08-06', business: ELEC, amount: 680, isIncome: false },
    { id: 'h3', date: '2026-09-06', business: ELEC, amount: 682.8, isIncome: false },
    { id: 'elec', date: '2026-10-06', business: ELEC, amount: 768.99, isIncome: false },
  ],
  envelopesByMonth: { '2026-10': briefEnvelopes },
  cashSpends: [taxi],
  cashTopups: [],
  withdrawalTopups: [],
  wallets: [{ id: 'w-main', name: 'ארנק ראשי', isDefault: true }],
  memberNames: new Map([['m1', 'יצחק'], ['m2', 'שרה']]),
});

const insights = computeInsights(
  {
    today: '2026-10-11',
    month: '2026-10',
    envelopes,
    trackers: [{ name: 'פארמה', planned: 450, actual: 300 }],
    forecast: -10217,
    yesterdayForecast: -9400,
    wallet: { balance: 365, wallets: [{ name: 'ארנק ראשי', balance: 365 }] },
    baselineExpenses: [40, 60, 80, 90, 100, 120, 35, 55, 70, 64],
  },
  new Map(),
);

const data: DashboardData = {
  setupSteps: setupSteps({
    lastSyncAt: '2026-10-11T04:36:00Z',
    telegramLinked: true,
    preferredName: 'יצחק',
    walletBalanceSet: true,
  }),
  preferredName: 'יצחק',
  month: '2026-10',
  months: ['2026-10', '2026-09'],
  userName: 'יצחק',
  greeting: 'יצחק',
  lastUpdated: '11.10 10:05',
  lastSyncAt: '2026-10-11T07:05:00Z',
  syncBanner: null,
  forecast: -10217,
  variableRemaining: 0,
  totalActualExpenses: 3043.99,
  totalExpectedExpenses: 9218,
  envelopes,
  plans: [],
  envelopeChoices: [
    { envelopeId: 'var', type: 'variable', name: 'הוצאות משתנות' },
    { envelopeId: 'fix', type: 'fixed', name: 'הוצאות קבועות' },
    { envelopeId: 'pharm', type: 'trackingCategory', name: 'פארמה' },
  ],
  savingsEnvelopeId: null,
  wallet: {
    balance: 365,
    wallets: [{ id: 'w-main', name: 'ארנק ראשי', balance: 365, isDefault: true, memberName: null }],
    withdrawn: 500, income: 0, spent: 135, movements: [],
  },
  members: [{ id: 'm1', display_name: 'יצחק' }, { id: 'm2', display_name: 'שרה' }],
  briefCount: brief.count,
};

const [target = 'brief-preview.html', mode = 'top'] = process.argv.slice(2);
const step = { intro: 0, item: 1, cash: 2, income: 3, end: brief.count + 1 }[mode];
const popupKey = mode === 'popup' ? insights.find((i) => i.kind === 'tracker-pace')?.key : undefined;

const css = ['../app/globals.css', '../app/brief-insights.css']
  .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
  .join('\n');

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Our Money — brief preview</title>
<style>${css}</style>
</head>
<body>${renderToStaticMarkup(
  <DashboardView data={data} sessionMemberId="m1" brief={brief} insights={insights} briefStep={step} insightOpenKey={popupKey} />,
)}</body>
</html>`;

writeFileSync(target, html);
console.log(`Wrote ${target} (${mode}; ${brief.count} brief cards, ${insights.length} insights: ${insights.map((i) => i.kind).join(', ')})`);

export {};
