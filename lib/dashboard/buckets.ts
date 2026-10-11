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

/** Day of the week the month's 1st falls on, 0 = Sunday. */
function firstWeekday(month: string): number {
  return new Date(`${month}-01T00:00:00Z`).getUTCDay();
}

function daysIn(month: string): number {
  const [year, mon] = month.split('-').map(Number);
  return new Date(Date.UTC(year!, mon!, 0)).getUTCDate();
}

/**
 * RiseUp counts calendar weeks, Sunday to Saturday, inside the month: the
 * first week runs from the 1st to the first Saturday, however short. So
 * 11 October 2026 (the 1st is a Thursday) is in week 3, not week 2.
 */
export function weekOfMonth(isoDate: string): number {
  const day = Number(isoDate.slice(8, 10));
  if (!Number.isFinite(day) || day < 1) return 1;
  return Math.floor((day - 1 + firstWeekday(isoDate.slice(0, 7))) / 7) + 1;
}

/** How many calendar weeks the month touches: four, five or six. */
export function weeksInMonth(month: string): number {
  return weekOfMonth(`${month}-${String(daysIn(month)).padStart(2, '0')}`);
}

/** A date outside the month (a late-billed charge) lands in the nearest edge week. */
function weekWithin(isoDate: string, month: string): number {
  const own = isoDate.slice(0, 7);
  if (own < month) return 1;
  if (own > month) return weeksInMonth(month);
  return weekOfMonth(isoDate);
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
    const week = weekWithin(actual.transactionDate, month);
    byWeek.set(week, [...(byWeek.get(week) ?? []), actual]);
  }

  return Array.from({ length: weeksInMonth(month) }, (_, index) => {
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
