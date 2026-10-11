/**
 * Render the tracker, income, filter, search and split screens to static HTML
 * with fixture data, one file per screen, for side-by-side comparison with
 * RiseUp's own (docs/feedback/2026-10-11-video1.md #17–#22).
 *
 *   npx tsx scripts/preview-area-d.tsx <outdir> [screen...]
 *
 * Each screen is drawn open, over a dashboard card, the way the app shows it.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';

import { AccountFilterSheet } from '../app/dashboard/components/AccountFilterSheet';
import { AddTrackerButton, AddTrackerSheet } from '../app/dashboard/components/AddTrackerSheet';
import { DashboardView } from '../app/dashboard/view';
import { EnvelopeCard } from '../app/dashboard/components/EnvelopeCard';
import { EnvelopeMenu } from '../app/dashboard/components/EnvelopeMenu';
import { ExpectedIncomePopup, MoveIncomesPopup } from '../app/dashboard/components/IncomeSheets';
import { TrackerHistorySheet } from '../app/dashboard/components/TrackerHistorySheet';
import { EditTargetPopup, HidePopup, RenamePopup } from '../app/dashboard/components/TrackerSheets';
import type { HistoryPoint, SearchHit } from '../lib/dashboard/actions';
import { SearchSheet } from '../app/dashboard/components/SearchSheet';
import type { DashboardData, EnvelopeView } from '../lib/dashboard/data';
import type { NormalizedActual } from '../lib/riseup/envelopes';

export const MONTH = '2026-10';

export function actual(id: string, date: string, amount: number, businessName: string, extra: Partial<NormalizedActual> = {}): NormalizedActual {
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

export const tracker: EnvelopeView = {
  key: `${MONTH}#trackingCategory#v2-default-il-expense-category-21#0`,
  envelopeId: `${MONTH}#trackingCategory#v2-default-il-expense-category-21#0`,
  type: 'trackingCategory',
  title: 'הקשיבה',
  actual: 0,
  expected: 720,
  showRemaining: true,
  pending: [],
  pendingTotal: 0,
  trackerKey: 'v2-default-il-expense-category-21',
  actuals: [],
};

export const retargeted: EnvelopeView = {
  ...tracker,
  title: 'רכב',
  expected: 2000,
  actual: 380,
  override: { custom: false, riseupName: 'רכב', riseupTarget: 2850, renamed: false, retargeted: true, monthOnly: false, categoryLabel: null },
};

const history: HistoryPoint[] = [
  { month: '2026-05', actual: 300, expected: 800, cash: 0, present: true },
  { month: '2026-06', actual: 100, expected: 800, cash: 0, present: true },
  { month: '2026-07', actual: 1475, expected: 800, cash: 0, present: true },
  { month: '2026-08', actual: 925, expected: 800, cash: 0, present: true },
  { month: '2026-09', actual: 0, expected: 800, cash: 0, present: true },
  { month: '2026-10', actual: 0, expected: 720, cash: 0, present: true },
];

const noop = () => {};

export const income: EnvelopeView = {
  key: 'income',
  envelopeId: 'income',
  type: 'variableIncome',
  title: 'הכנסות',
  actual: 7635,
  expected: 7635,
  showRemaining: false,
  pending: [],
  pendingTotal: 0,
  actuals: [actual('i1', `${MONTH}-08`, 7635, 'העברת משכורת חשבון 674-1908922', { isIncome: true })],
};

const cashIncomeEnvelope: EnvelopeView = {
  ...income,
  key: 'cash-income',
  envelopeId: 'cash-income',
  type: 'cashIncome',
  title: 'הכנסות במזומן',
  actual: 650,
  expected: 650,
  actuals: [
    actual('cash-income:a', `${MONTH}-03`, 350, 'מתנה מסבתא', { isIncome: true, source: 'cash', cash: { id: 'a', kind: 'income', memberName: 'שרה', inputKind: 'web', status: 'confirmed', walletId: null } }),
    actual('cash-income:b', `${MONTH}-09`, 300, 'שיעור פרטי', { isIncome: true, source: 'cash', cash: { id: 'b', kind: 'income', memberName: 'שרה', inputKind: 'web', status: 'confirmed', walletId: null } }),
  ],
};

const variable: EnvelopeView = {
  ...income,
  key: 'variable',
  envelopeId: 'variable',
  type: 'variable',
  title: 'הוצאות משתנות',
  actual: 152.1,
  expected: 2400,
  actuals: [
    actual('v1', `${MONTH}-01`, 60, 'באג בית שמש', { source: 'card', accountNumberHash: '0848' }),
    actual('v2', `${MONTH}-04`, 92.1, 'שופרסל דיל', { source: 'card', accountNumberHash: '7722' }),
  ],
};

const dashboard: DashboardData = {
  month: MONTH,
  months: [MONTH, '2026-09'],
  userName: 'יצחק',
  greeting: 'יצחק',
  lastUpdated: null,
  lastSyncAt: null,
  syncBanner: null,
  forecast: -10217,
  variableRemaining: 2247.9,
  totalActualExpenses: 152.1,
  totalExpectedExpenses: 3120,
  envelopes: [variable, tracker, income],
  plans: [],
  envelopeChoices: [],
  savingsEnvelopeId: null,
  wallet: { balance: 0, wallets: [], withdrawn: 0, income: 0, spent: 0, movements: [] },
  members: [{ id: 'm1', display_name: 'יצחק' }],
  briefCount: 0,
};

const searchProps = { envelopes: [], months: [MONTH], members: [], wallets: [], sessionMemberId: null, onClose: noop };

function hit(id: string, date: string, amount: number, name: string, type: EnvelopeView['type'], extra: Partial<SearchHit> = {}): SearchHit {
  const row = actual(id, date, amount, name, { accountNumberHash: '0848' });
  return {
    key: id,
    source: 'card',
    kind: 'spend',
    id,
    date,
    month: date.slice(0, 7),
    amountIls: amount,
    title: name,
    category: null,
    note: null,
    memberId: null,
    walletId: null,
    fromBank: false,
    detail: '0848',
    actual: row,
    envelopeType: type,
    envelopeTitle: '',
    envelopeId: null,
    ...extra,
  };
}

const searchHits: SearchHit[] = [
  hit('s1', `${MONTH}-01`, 60, 'באג בית שמש', 'variable'),
  hit('s2', '2026-09-14', 45, 'באגט — מאפייה', 'variable', { source: 'cash', title: 'באגט — מאפייה', category: 'מזון וצריכה' }),
  hit('s3', '2026-09-02', 1299, 'באג מחשבים', 'trackingCategory'),
  hit('s4', '2026-07-21', 89.9, 'באג בית שמש', 'variable'),
];

const incomeHistory: HistoryPoint[] = [
  { month: '2026-06', actual: 7400, expected: 7400, cash: 0, present: true },
  { month: '2026-07', actual: 7635, expected: 7635, cash: 0, present: true },
  { month: '2026-08', actual: 9100, expected: 7635, cash: 0, present: true },
  { month: '2026-09', actual: 7635, expected: 7635, cash: 0, present: true },
  { month: '2026-10', actual: 7635, expected: 7635, cash: 0, present: true },
];

const offer = {
  categories: [
    { label: 'חיות מחמד', spent: 820 },
    { label: 'אחר', spent: 410 },
    { label: 'תחבורה ציבורית', spent: 260 },
    { label: 'פארמה', spent: 0 },
  ],
  hidden: [{ key: 'v2-default-il-expense-category-9', name: 'מגנטים' }],
};

function background(envelope: EnvelopeView, after?: ReactElement): ReactElement {
  return (
    <div className="app" style={{ paddingTop: 16 }}>
      <div className="section">
        {card(envelope)}
        {after}
      </div>
    </div>
  );
}

function card(envelope: EnvelopeView): ReactElement {
  return (
        <EnvelopeCard
          type={envelope.type}
          title={envelope.title}
          actual={envelope.actual}
          expected={envelope.expected}
          actuals={envelope.actuals}
          month={MONTH}
          today={`${MONTH}-11`}
          showRemaining={envelope.showRemaining}
          onOpenTransaction={noop}
          pending={envelope.pending}
          pendingTotal={envelope.pendingTotal}
          onMenu={noop}
        />
  );
}

export const screens: Record<string, () => ReactElement> = {
  'tracker-menu': () => (
    <>
      {background(tracker)}
      <EnvelopeMenu envelope={tracker} onPick={noop} onClose={noop} />
    </>
  ),
  'tracker-history': () => (
    <>
      {background(tracker)}
      <TrackerHistorySheet envelope={tracker} month={MONTH} onClose={noop} onEditTarget={noop} initialPoints={history} />
    </>
  ),
  'tracker-history-ours': () => (
    <>
      {background(retargeted)}
      <TrackerHistorySheet envelope={retargeted} month={MONTH} onClose={noop} onEditTarget={noop} initialPoints={history} />
    </>
  ),
  'edit-target': () => (
    <>
      {background(tracker)}
      <EditTargetPopup envelope={tracker} month={MONTH} onClose={noop} initialPoints={history} />
    </>
  ),
  rename: () => (
    <>
      {background(retargeted)}
      <RenamePopup envelope={{ ...retargeted, title: 'האוטו', override: { ...retargeted.override!, renamed: true } }} onClose={noop} />
    </>
  ),
  'add-tracker-button': () =>
    background(
      { ...tracker, title: 'טרריומים', expected: 1000 },
      <>
        <AddTrackerButton onClick={noop} />
        {card({ ...tracker, key: 'fixed', type: 'fixed', title: 'הוצאות קבועות', expected: 6195.4, actual: 4437.7, showRemaining: false })}
      </>,
    ),
  'add-tracker': () => (
    <>
      {background(tracker)}
      <AddTrackerSheet month={MONTH} trackedNames={[]} onClose={noop} initial={offer} />
    </>
  ),
  'add-tracker-target': () => (
    <>
      {background(tracker)}
      <AddTrackerSheet month={MONTH} trackedNames={[]} onClose={noop} initial={offer} initialPick={offer.categories[0]} />
    </>
  ),
  'income-menu': () => (
    <>
      {background(income)}
      <EnvelopeMenu envelope={income} onPick={noop} onClose={noop} />
    </>
  ),
  'income-history': () => (
    <>
      {background(income)}
      <TrackerHistorySheet envelope={income} month={MONTH} onClose={noop} onEditTarget={noop} initialPoints={incomeHistory} />
    </>
  ),
  'income-target': () => (
    <>
      {background(income)}
      <ExpectedIncomePopup envelope={{ ...income, expected: 9000 }} month={MONTH} onClose={noop} />
    </>
  ),
  'move-incomes': () => (
    <>
      {background(income)}
      <MoveIncomesPopup envelopes={[income, cashIncomeEnvelope]} month={MONTH} months={[MONTH, '2026-09']} onClose={noop} />
    </>
  ),
  filter: () => (
    <>
      {background(income)}
      <AccountFilterSheet
        accounts={[
          { key: 'card:7722', label: 'לאומי קארד 7722', cash: false },
          { key: 'card:0848', label: 'לאומי קארד 0848', cash: false },
          { key: 'bank:674', label: 'בנק לאומי 674-1908922', cash: false },
          { key: 'cash', label: 'מזומן', cash: true },
        ]}
        hidden={new Set(['card:0848'])}
        onApply={noop}
        onClose={noop}
      />
    </>
  ),
  'filter-chip': () => <DashboardView data={dashboard} sessionMemberId="m1" previewHiddenAccounts={['card:0848']} />,
  'search-empty': () => <SearchSheet {...searchProps} />,
  'search-loading': () => <SearchSheet {...searchProps} initialQuery="באג" initialPhase="loading" />,
  'search-results': () => (
    <SearchSheet {...searchProps} initialQuery="באג" initialPhase="done" initialHits={searchHits} initialNext={{ card: 3, spend: 1, topup: 0 }} />
  ),
  hide: () => (
    <>
      {background(tracker)}
      <HidePopup envelope={tracker} onClose={noop} />
    </>
  ),
};

export function page(body: ReactElement): string {
  const css = ['../app/globals.css', '../app/dashboard/trackers-search.css']
    .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
    .join('\n');
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Our Money — preview</title>
<style>${css}</style>
</head>
<body>${renderToStaticMarkup(body)}</body>
</html>`;
}

const outDir = process.argv[2] ?? '.shots';
const wanted = process.argv.slice(3);
mkdirSync(outDir, { recursive: true });
for (const [name, render] of Object.entries(screens)) {
  if (wanted.length > 0 && !wanted.includes(name)) continue;
  writeFileSync(join(outDir, `${name}.html`), page(render()));
  console.log(`Wrote ${join(outDir, `${name}.html`)}`);
}
