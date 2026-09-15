import { describe, expect, it } from 'vitest';

import { buildBuckets, weekOfMonth, WEEKS_PER_MONTH } from '@/lib/dashboard/buckets';
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
  it.each([
    ['2026-09-01', 1],
    ['2026-09-07', 1],
    ['2026-09-08', 2],
    ['2026-09-14', 2],
    ['2026-09-15', 3],
    ['2026-09-28', 4],
    ['2026-09-29', 5],
  ])('puts %s in week %i', (date, week) => {
    expect(weekOfMonth(date)).toBe(week);
  });

  it('keeps a 31st inside the last week rather than inventing a sixth', () => {
    expect(weekOfMonth('2026-12-31')).toBe(WEEKS_PER_MONTH);
  });
});

describe('buildBuckets — variable expenses', () => {
  const options = { today: '2026-09-15', month: '2026-09' };

  it('always emits five week rows, even when most are empty', () => {
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
