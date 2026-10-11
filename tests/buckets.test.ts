import { describe, expect, it } from 'vitest';

import { buildBuckets, weekOfMonth, weeksInMonth } from '@/lib/dashboard/buckets';
import type { NormalizedActual } from '@/lib/riseup/envelopes';

function actual(
  date: string,
  amount: number,
  overrides: Partial<NormalizedActual> = {},
): NormalizedActual {
  return {
    transactionId: `${date}-${amount}`,
    transactionDate: date,
    billingDate: date,
    businessName: 'חנות',
    amountIls: amount,
    isIncome: false,
    accountNickname: null,
    accountNumberHash: null,
    source: null,
    isInstallment: false,
    paymentNumber: null,
    totalPayments: null,
    categoryLabel: null,
    ...overrides,
  };
}

describe('weekOfMonth', () => {
  // RiseUp counts calendar weeks, Sunday to Saturday, inside the month.
  // September 2026 starts on a Tuesday; October 2026 on a Thursday.
  it.each([
    ['2026-09-01', 1],
    ['2026-09-05', 1],
    ['2026-09-06', 2],
    ['2026-09-12', 2],
    ['2026-09-13', 3],
    ['2026-09-27', 5],
    ['2026-09-30', 5],
    ['2026-10-01', 1],
    ['2026-10-03', 1],
    ['2026-10-04', 2],
    ['2026-10-10', 2],
    ['2026-10-11', 3],
    ['2026-10-17', 3],
    ['2026-10-31', 5],
  ])('puts %s in week %i', (date, week) => {
    expect(weekOfMonth(date)).toBe(week);
  });

  it('runs to a sixth week when the month touches six calendar weeks', () => {
    // August 2026 starts on a Saturday: the 1st is a week of its own.
    expect(weekOfMonth('2026-08-01')).toBe(1);
    expect(weekOfMonth('2026-08-02')).toBe(2);
    expect(weekOfMonth('2026-08-31')).toBe(6);
  });
});

describe('weeksInMonth', () => {
  it.each([
    ['2026-09', 5],
    ['2026-10', 5],
    ['2026-08', 6],
    // February 2026 starts on a Sunday and has 28 days: exactly four weeks.
    ['2026-02', 4],
  ])('%s touches %i calendar weeks', (month, weeks) => {
    expect(weeksInMonth(month)).toBe(weeks);
  });
});

describe('buildBuckets — variable expenses', () => {
  const options = { today: '2026-09-15', month: '2026-09' };

  it('emits one row per calendar week the month touches, even when most are empty', () => {
    const buckets = buildBuckets('variable', [actual('2026-09-02', 40)], options);
    expect(buckets).toHaveLength(5);
    expect(buckets.map((b) => b.label)).toEqual([
      'שבוע 1',
      'שבוע 2',
      'שבוע 3',
      'שבוע 4',
      'שבוע 5',
    ]);
  });

  it('sums each week and marks empties', () => {
    const buckets = buildBuckets(
      'variable',
      [actual('2026-09-02', 40), actual('2026-09-03', 52.1), actual('2026-09-09', 92.1)],
      options,
    );
    expect(buckets[0]).toMatchObject({ actual: 92.1, isEmpty: false });
    expect(buckets[1]).toMatchObject({ actual: 92.1, isEmpty: false });
    expect(buckets[3]).toMatchObject({ actual: 0, isEmpty: true });
  });

  it('badges the week the month is currently in', () => {
    const buckets = buildBuckets('variable', [], options);
    expect(buckets.filter((b) => b.isCurrent).map((b) => b.label)).toEqual(['שבוע 3']);
  });

  it('marks week 3 as current on 11 October, as RiseUp does', () => {
    const buckets = buildBuckets('variable', [], { today: '2026-10-11', month: '2026-10' });
    expect(buckets.filter((b) => b.isCurrent).map((b) => b.label)).toEqual(['שבוע 3']);
  });

  it('shows six rows for a month that touches six calendar weeks', () => {
    const buckets = buildBuckets('variable', [actual('2026-08-31', 10)], { month: '2026-08' });
    expect(buckets).toHaveLength(6);
    expect(buckets[5]).toMatchObject({ label: 'שבוע 6', actual: 10 });
  });

  it('files a charge dated outside the month into its nearest edge week', () => {
    const buckets = buildBuckets(
      'variable',
      [actual('2026-09-29', 30), actual('2026-11-01', 20)],
      { month: '2026-10' },
    );
    expect(buckets[0]?.actual).toBe(30);
    expect(buckets[buckets.length - 1]?.actual).toBe(20);
  });

  it('badges no week when viewing a past month', () => {
    const buckets = buildBuckets('variable', [], { today: '2026-09-15', month: '2026-07' });
    expect(buckets.some((b) => b.isCurrent)).toBe(false);
  });
});

describe('buildBuckets — category breakdown', () => {
  it('groups by category label, largest first', () => {
    const buckets = buildBuckets(
      'fixed',
      [
        actual('2026-09-03', 74.8, { categoryLabel: 'ביטוח' }),
        actual('2026-09-05', 1842.4, { categoryLabel: 'הלוואה' }),
        actual('2026-09-09', 25.2, { categoryLabel: 'ביטוח' }),
      ],
      { month: '2026-09' },
    );

    expect(buckets.map((b) => [b.label, b.actual])).toEqual([
      ['הלוואה', 1842.4],
      ['ביטוח', 100],
    ]);
  });

  it('mirrors actual into expected, the only honest reconstruction available', () => {
    // RiseUp shows expected == actual for a charge that already happened; a
    // per-category plan is not in the read-only API.
    const buckets = buildBuckets(
      'fixed',
      [actual('2026-09-03', 74.8, { categoryLabel: 'ביטוח' })],
      { month: '2026-09' },
    );
    expect(buckets[0]).toMatchObject({ actual: 74.8, expected: 74.8 });
  });

  it('leaves weekly buckets with no expected figure', () => {
    const buckets = buildBuckets('variable', [actual('2026-09-02', 40)], {
      month: '2026-09',
    });
    expect(buckets[0]?.expected).toBeNull();
  });

  it('falls back to the merchant when a transaction has no category', () => {
    const buckets = buildBuckets('trackingCategory', [actual('2026-09-03', 50)], {
      month: '2026-09',
    });
    expect(buckets[0]?.label).toBe('חנות');
  });
});
