import { describe, expect, it } from 'vitest';

import type { EnvelopeView } from '@/lib/dashboard/data';
import type { NormalizedActual } from '@/lib/riseup/envelopes';
import { composeWeeklySummary, summaryWeek, trackerAlerts, weekSpending } from '@/lib/telegram/weekly-summary';

function actual(date: string, amount: number, extra: Partial<NormalizedActual> = {}): NormalizedActual {
  return {
    transactionId: `t-${date}-${amount}`,
    transactionDate: date,
    billingDate: date,
    businessName: 'עסק',
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

function cash(date: string, amount: number): NormalizedActual {
  return actual(date, amount, {
    transactionId: `cash:${date}-${amount}`,
    source: 'cash',
    cash: { id: 'c', kind: 'spend', memberName: null, inputKind: 'text', status: 'confirmed', walletId: null },
  });
}

function envelope(
  title: string,
  type: EnvelopeView['type'],
  actuals: NormalizedActual[],
  figures: { planned?: number; expected?: number } = {},
): EnvelopeView {
  const total = actuals.reduce((s, a) => s + a.amountIls, 0);
  return {
    key: title,
    envelopeId: title,
    type,
    title,
    actual: total,
    expected: figures.expected ?? figures.planned ?? total,
    planned: figures.planned,
    actuals,
    showRemaining: type === 'trackingCategory',
    pending: [],
    pendingTotal: 0,
  };
}

describe('C24: the week a Sunday summary covers', () => {
  it('is Sunday to Saturday before the Sunday it is sent on', () => {
    expect(summaryWeek('2026-10-18')).toEqual({ key: '2026-10-18', from: '2026-10-11', to: '2026-10-17' });
  });

  it('a late run on Monday still reports the same week (and the same key)', () => {
    expect(summaryWeek('2026-10-19')).toEqual({ key: '2026-10-18', from: '2026-10-11', to: '2026-10-17' });
  });

  it('crosses a month boundary', () => {
    expect(summaryWeek('2026-11-01')).toEqual({ key: '2026-11-01', from: '2026-10-25', to: '2026-10-31' });
  });
});

describe('C24: last week’s spending', () => {
  const week = { from: '2026-10-11', to: '2026-10-17' };

  it('adds RiseUp charges and cash from the week, by envelope, biggest first', () => {
    const envelopes = [
      envelope('הוצאות משתנות', 'variable', [actual('2026-10-12', 500), cash('2026-10-13', 80), actual('2026-10-05', 999)]),
      envelope('סופר', 'trackingCategory', [actual('2026-10-11', 700), actual('2026-10-17', 120)]),
      envelope('הוצאות קבועות', 'fixed', [actual('2026-10-15', 300)]),
      envelope('אוכל בחוץ', 'trackingCategory', [actual('2026-10-16', 90)]),
      // Savings and income are not spending.
      envelope('חיסכון', 'riseupGoal', [actual('2026-10-12', 1000)]),
      envelope('הכנסות', 'variableIncome', [actual('2026-10-12', 9000, { isIncome: true })]),
    ];
    const spending = weekSpending(envelopes, week);
    expect(spending.total).toBe(1790);
    expect(spending.cash).toBe(80);
    expect(spending.top).toEqual([
      { title: 'סופר', amount: 820 },
      { title: 'הוצאות משתנות', amount: 580 },
      { title: 'הוצאות קבועות', amount: 300 },
    ]);
  });

  it('joins the same envelope from two months when the week crosses them', () => {
    const spending = weekSpending(
      [envelope('סופר', 'trackingCategory', [actual('2026-11-01', 100)])],
      { from: '2026-10-25', to: '2026-10-31' },
      [envelope('סופר', 'trackingCategory', [actual('2026-10-30', 250)])],
    );
    expect(spending.top).toEqual([{ title: 'סופר', amount: 250 }]);
  });
});

describe('C24: trackers worth a look', () => {
  it('flags a tracker over its target, and one running fast for the date', () => {
    const alerts = trackerAlerts(
      [
        envelope('סופר', 'trackingCategory', [actual('2026-10-10', 3200)], { planned: 3000, expected: 3200 }),
        envelope('אוכל בחוץ', 'trackingCategory', [actual('2026-10-10', 450)], { planned: 600 }),
        envelope('דלק', 'trackingCategory', [actual('2026-10-10', 200)], { planned: 800 }),
        envelope('הוצאות משתנות', 'variable', [actual('2026-10-10', 9000)], { planned: 5000 }),
      ],
      '2026-10-18',
    );
    expect(alerts.map((a) => [a.title, a.kind])).toEqual([
      ['סופר', 'over'],
      ['אוכל בחוץ', 'fast'],
    ]);
  });

  it('flags a weekly tracker RiseUp already expects to go over', () => {
    const alerts = trackerAlerts(
      [envelope('סופר', 'trackingCategory', [actual('2026-10-10', 1000)], { planned: 3000, expected: 3300 })],
      '2026-10-18',
    );
    expect(alerts).toEqual([{ title: 'סופר', kind: 'fast', actual: 1000, planned: 3000, expected: 3300 }]);
  });
});

describe('C24: the message', () => {
  const base = {
    today: '2026-10-18',
    month: '2026-10',
    week: { key: '2026-10-18', from: '2026-10-11', to: '2026-10-17' },
    envelopes: [
      envelope('הוצאות משתנות', 'variable', [actual('2026-10-12', 1200), cash('2026-10-13', 180)]),
      envelope('סופר', 'trackingCategory', [actual('2026-10-11', 3200)], { planned: 3000, expected: 3200 }),
      envelope('אוכל בחוץ', 'trackingCategory', [actual('2026-10-16', 450)], { planned: 600 }),
    ],
    walletBalance: 1240,
    forecast: 2150.4,
    names: ['יצחק', 'שרה'],
    dashboardUrl: 'https://our-money.test/dashboard',
  };

  it('says the week, the top envelopes, the trackers, the cash and the forecast, with a link', () => {
    const text = composeWeeklySummary(base);
    expect(text).toContain('בוקר טוב, יצחק ושרה');
    expect(text).toContain('11.10–17.10');
    expect(text).toContain('<b>₪5,030</b>');
    expect(text).toContain('סופר ₪3,200');
    expect(text).toContain('עברתם את היעד ב-₪200');
    expect(text).toContain('אוכל בחוץ');
    expect(text).toContain('₪1,240');
    expect(text).toContain('₪180');
    expect(text).toContain('התזרים של אוקטובר צפוי להסתיים בפלוס של <b>₪2,150</b>');
    expect(text).toContain('https://our-money.test/dashboard');
    // Short: one Telegram screen.
    expect(text.split('\n').length).toBeLessThanOrEqual(16);
  });

  it('says a minus forecast in words, and a quiet week plainly', () => {
    const text = composeWeeklySummary({ ...base, envelopes: [], forecast: -800, walletBalance: 0 });
    expect(text).toContain('בשבוע שעבר לא נרשמו הוצאות');
    expect(text).toContain('במינוס של <b>₪800</b>');
    expect(text).not.toContain('מעקבים');
    expect(text).not.toContain('בארנקים');
  });

  it('escapes names and envelope titles', () => {
    const text = composeWeeklySummary({ ...base, names: ['<b>'], envelopes: [envelope('a<b', 'variable', [actual('2026-10-12', 10)])] });
    expect(text).toContain('&lt;b&gt;');
    expect(text).toContain('a&lt;b');
  });
});
