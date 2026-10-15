import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EnvelopeCard } from '@/app/dashboard/components/EnvelopeCard';
import { RiseupNoteSheet } from '@/app/dashboard/components/RiseupNoteSheet';
import { TransactionSheet } from '@/app/dashboard/components/TransactionSheet';
import { dayLabel } from '@/lib/dashboard/day-label';
import { noteMap, quotedIdList } from '@/lib/dashboard/notes';
import type { NormalizedActual } from '@/lib/riseup/envelopes';

const TODAY = '2026-10-15';

function charge(id: string, date: string, extra: Partial<NormalizedActual> = {}): NormalizedActual {
  return {
    transactionId: id,
    transactionDate: date,
    billingDate: date,
    businessName: 'דל פסטו',
    amountIls: 42,
    isIncome: false,
    accountNickname: null,
    accountNumberHash: null,
    source: 'leumicard',
    isInstallment: false,
    paymentNumber: null,
    totalPayments: null,
    categoryLabel: 'אוכל בחוץ',
    accountName: 'לאומי קארד',
    ...extra,
  };
}

describe('"היום" and "אתמול" on recent rows (V2-16b)', () => {
  it('names the two most recent days and dates the rest', () => {
    expect(dayLabel('2026-10-15', TODAY)).toBe('היום');
    expect(dayLabel('2026-10-14', TODAY)).toBe('אתמול');
    expect(dayLabel('2026-10-13', TODAY)).toBe('13.10.26');
    expect(dayLabel('2026-09-30', '2026-10-01')).toBe('אתמול');
    expect(dayLabel('2026-10-16', TODAY)).toBe('16.10.26');
    expect(dayLabel(null, TODAY)).toBe('');
  });
});

describe('our note on a RiseUp charge (V2-16a)', () => {
  const noted = charge('t1', '2026-10-14', { note: 'שניצל' });

  it('shows under the merchant in the envelope breakdown, with "אתמול" for the date', () => {
    const html = renderToStaticMarkup(
      createElement(EnvelopeCard, {
        type: 'trackingCategory',
        title: 'אוכל בחוץ',
        actual: 84,
        expected: 500,
        actuals: [noted, charge('t2', '2026-10-15')],
        month: '2026-10',
        today: TODAY,
        defaultOpen: true,
      }),
    );
    expect(html).toMatch(/<span class="txn-note"><svg[^]*?<\/svg><span>שניצל<\/span><\/span>/);
    expect(html).toMatch(/<span class="date">אתמול<\/span>/);
    expect(html).toMatch(/<span class="date">היום<\/span>/);
    expect(html.match(/txn-note/g)).toHaveLength(1);
  });

  const sheet = (actual: NormalizedActual) =>
    renderToStaticMarkup(
      createElement(TransactionSheet, {
        open: true,
        onClose: () => {},
        transaction: { actual, envelopeTitle: 'אוכל בחוץ', envelopeType: 'trackingCategory', envelopeId: 'e1' },
        walletName: null,
        onCashAction: () => {},
        onEditCash: () => {},
        onSavings: () => {},
        onDeleteCash: () => {},
      }),
    );

  it('the transaction sheet lets you add one to a RiseUp charge, and says it stays with us', () => {
    const html = sheet(charge('t2', '2026-10-15'));
    const noteRow = /<button class="action-row" type="button"( disabled="")?[^>]*>(?:(?!<\/button>).)*להוסיף הערה/.exec(html);
    expect(noteRow).not.toBeNull();
    expect(noteRow![1]).toBeUndefined();
    // The rest stays read-only, as RiseUp's API is.
    expect(html).toMatch(/disabled=""[^>]*>(?:(?!<\/button>).)*להזיז את ההוצאה/);
    expect(html).toContain('הערות נשמרות אצלנו בלבד');
  });

  it('shows the note on the sheet and offers to edit it', () => {
    const html = sheet(noted);
    expect(html).toContain('<p class="meta txn-sheet-note">שניצל</p>');
    expect(html).toContain('לערוך את ההערה');
  });

  it('the note sheet starts from the current note and is honest about where it lives', () => {
    const html = renderToStaticMarkup(createElement(RiseupNoteSheet, { actual: noted, month: '2026-10', onClose: () => {} }));
    expect(html).toContain('value="שניצל"');
    expect(html).toContain('maxLength="300"');
    expect(html).toContain('רייזאפ לא משתנה');
  });
});

describe('note helpers', () => {
  it('maps rows by transaction id and treats a failed read as no notes', () => {
    expect(noteMap([{ transaction_id: 'a', note: 'x' }]).get('a')).toBe('x');
    expect(noteMap(null).size).toBe(0);
  });

  it('quotes ids so nothing in one can change the search filter', () => {
    expect(quotedIdList(['a-1', 'b,2', 'c"3)'])).toBe('("a-1","b,2","c\\"3)")');
  });
});
