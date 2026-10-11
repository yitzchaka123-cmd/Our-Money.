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

import { EnvelopeCard } from '../app/dashboard/components/EnvelopeCard';
import { EnvelopeMenu } from '../app/dashboard/components/EnvelopeMenu';
import { TrackerHistorySheet } from '../app/dashboard/components/TrackerHistorySheet';
import { EditTargetPopup, HidePopup, RenamePopup } from '../app/dashboard/components/TrackerSheets';
import type { HistoryPoint } from '../lib/dashboard/actions';
import type { EnvelopeView } from '../lib/dashboard/data';
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

function background(envelope: EnvelopeView): ReactElement {
  return (
    <div className="app" style={{ paddingTop: 16 }}>
      <div className="section">
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
      </div>
    </div>
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
