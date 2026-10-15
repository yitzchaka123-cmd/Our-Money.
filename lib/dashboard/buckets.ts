import type { NormalizedActual, UpcomingCharge } from '@/lib/riseup/envelopes';
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
  /** Only charges still expected this month: greyed, but it opens. */
  isUpcoming: boolean;
  items: NormalizedActual[];
  /** Fixed charges in this category that have not come in yet. */
  upcoming: UpcomingCharge[];
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
 * A weekly tracker's expected spending, the way RiseUp counts it: RiseUp
 * splits the month's plan into one part per calendar week (part `#k` is week
 * k + 1). A week that is over counts what was really spent in it; the
 * current week and the ones after it count their plan, or what was spent if
 * that is more. A month that is over counts only what was spent; a month to
 * come counts every plan. `actuals` are bucketed by date, cash included.
 */
export function weeklyExpected({
  weekPlans,
  actuals,
  month,
  today,
}: {
  weekPlans: number[];
  actuals: NormalizedActual[];
  month: string;
  today: string;
}): { total: number; byWeek: number[] } {
  const thisMonth = today.slice(0, 7);
  const firstOpenWeek = thisMonth < month ? 1 : thisMonth > month ? Infinity : weekOfMonth(today);
  const weeks = Math.max(weeksInMonth(month), weekPlans.length);
  const spent = new Array<number>(weeks).fill(0);
  for (const actual of actuals) {
    if (!actual.transactionDate) continue;
    const week = weekWithin(actual.transactionDate, month);
    spent[week - 1] = (spent[week - 1] ?? 0) + actual.amountIls;
  }
  const byWeek = spent.map((s, index) => {
    const plan = weekPlans[index] ?? 0;
    return round(index + 1 < firstOpenWeek ? s : Math.max(plan, s));
  });
  return { total: round(byWeek.reduce((sum, value) => sum + value, 0)), byWeek };
}

/**
 * Variable expenses — and a tracker RiseUp keeps by the week — break down by
 * week (`פירוט שבועי`); everything else breaks down by the category label on
 * its transactions (`פירוט חודשי`), with the fixed charges still expected this
 * month folded into their category.
 */
export function buildBuckets(
  type: EnvelopeType,
  actuals: NormalizedActual[],
  options: {
    today?: string;
    month: string;
    upcoming?: UpcomingCharge[];
    weekly?: boolean;
    /** A weekly tracker's plan per week: each week then shows what it is expected to cost. */
    weekPlans?: number[];
  },
): Bucket[] {
  return type === 'variable' || options.weekly
    ? weeklyBuckets(actuals, options)
    : categoryBuckets(actuals, options.upcoming ?? []);
}

function weeklyBuckets(
  actuals: NormalizedActual[],
  { today, month, weekPlans }: { today?: string; month: string; weekPlans?: number[] },
): Bucket[] {
  const currentWeek =
    today && today.slice(0, 7) === month ? weekOfMonth(today) : null;
  const expectedByWeek =
    weekPlans && today ? weeklyExpected({ weekPlans, actuals, month, today }).byWeek : null;

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
      expected: expectedByWeek ? (expectedByWeek[index] ?? 0) : null,
      isCurrent: currentWeek === week,
      isEmpty: items.length === 0,
      isUpcoming: false,
      items,
      upcoming: [],
    };
  });
}

function categoryBuckets(actuals: NormalizedActual[], upcoming: UpcomingCharge[]): Bucket[] {
  const byCategory = new Map<string, { items: NormalizedActual[]; upcoming: UpcomingCharge[] }>();
  const slot = (label: string) => {
    const existing = byCategory.get(label);
    if (existing) return existing;
    const fresh = { items: [] as NormalizedActual[], upcoming: [] as UpcomingCharge[] };
    byCategory.set(label, fresh);
    return fresh;
  };

  for (const actual of actuals) {
    slot(actual.categoryLabel?.trim() || actual.businessName || 'אחר').items.push(actual);
  }
  for (const charge of upcoming) {
    slot(charge.categoryLabel?.trim() || charge.businessName || 'אחר').upcoming.push(charge);
  }

  return [...byCategory.entries()]
    .map(([label, { items, upcoming: due }]) => {
      const actual = round(items.reduce((sum, item) => sum + item.amountIls, 0));
      const stillDue = round(due.reduce((sum, charge) => sum + charge.amountIls, 0));
      return {
        key: label,
        label,
        actual,
        // The budget gives a plan per charge. For a charge that already
        // happened RiseUp shows plan and actual as equal; a charge still to
        // come adds its plan.
        expected: round(actual + stillDue),
        isCurrent: false,
        isEmpty: items.length === 0 && due.length === 0,
        isUpcoming: items.length === 0 && due.length > 0,
        items,
        upcoming: due,
      };
    })
    .sort((a, b) => b.actual - a.actual || (b.expected ?? 0) - (a.expected ?? 0));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
