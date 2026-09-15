import type { NormalizedActual } from '@/lib/riseup/envelopes';
import type { EnvelopeType } from '@/lib/types';

export interface Bucket {
  key: string;
  label: string;
  actual: number;
  /** Expected for this bucket, when the envelope type has a per-bucket plan. */
  expected: number | null;
  /** True for the week the month is currently in — RiseUp badges it. */
  isCurrent: boolean;
  /** Nothing happened and nothing is expected: rendered greyed out. */
  isEmpty: boolean;
  items: NormalizedActual[];
}

/** RiseUp splits a month into five week rows, the last one short. */
export const WEEKS_PER_MONTH = 5;

export function weekOfMonth(isoDate: string): number {
  const day = Number(isoDate.slice(8, 10));
  if (!Number.isFinite(day) || day < 1) return 1;
  return Math.min(Math.ceil(day / 7), WEEKS_PER_MONTH);
}

/**
 * Variable expenses break down by week (`פירוט שבועי`); everything else breaks
 * down by the category label on its transactions (`פירוט חודשי`).
 */
export function buildBuckets(
  type: EnvelopeType,
  actuals: NormalizedActual[],
  options: { today?: string; month: string },
): Bucket[] {
  return type === 'variable'
    ? weeklyBuckets(actuals, options)
    : categoryBuckets(actuals);
}

function weeklyBuckets(
  actuals: NormalizedActual[],
  { today, month }: { today?: string; month: string },
): Bucket[] {
  const currentWeek =
    today && today.slice(0, 7) === month ? weekOfMonth(today) : null;

  const byWeek = new Map<number, NormalizedActual[]>();
  for (const actual of actuals) {
    if (!actual.transactionDate) continue;
    const week = weekOfMonth(actual.transactionDate);
    byWeek.set(week, [...(byWeek.get(week) ?? []), actual]);
  }

  return Array.from({ length: WEEKS_PER_MONTH }, (_, index) => {
    const week = index + 1;
    const items = byWeek.get(week) ?? [];
    const actual = round(items.reduce((sum, item) => sum + item.amountIls, 0));
    return {
      key: `week-${week}`,
      label: `שבוע ${week}`,
      actual,
      expected: null,
      isCurrent: currentWeek === week,
      isEmpty: items.length === 0,
      items,
    };
  });
}

function categoryBuckets(actuals: NormalizedActual[]): Bucket[] {
  const byCategory = new Map<string, NormalizedActual[]>();
  for (const actual of actuals) {
    const label = actual.categoryLabel?.trim() || actual.businessName || 'אחר';
    byCategory.set(label, [...(byCategory.get(label) ?? []), actual]);
  }

  return [...byCategory.entries()]
    .map(([label, items]) => {
      const actual = round(items.reduce((sum, item) => sum + item.amountIls, 0));
      return {
        key: label,
        label,
        actual,
        // The budget endpoint gives a plan per envelope, not per category
        // inside it. For a charge that already happened RiseUp shows the two
        // as equal, so that is the honest reconstruction; a category that was
        // expected but has not been charged cannot appear here at all.
        expected: actual,
        isCurrent: false,
        isEmpty: items.length === 0,
        items,
      };
    })
    .sort((a, b) => b.actual - a.actual);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
