import { addTrackerSlot } from '@/lib/dashboard/trackers';

const EXPENSES = new Set(['variable', 'fixed', 'trackingCategory', 'riseupGoal']);

/**
 * Which envelope the spending summary ("סך כל ההוצאות עד עכשיו…") follows.
 * RiseUp puts it after the fixed envelope. A month with no fixed envelope
 * must not lose it: then it follows the last tracker — and so the
 * "הוספת קטגוריה למעקב" button after it — or the variable envelope, or
 * failing those the last expense envelope.
 */
export function summarySlot(envelopes: { key: string; type: string }[]): string | null {
  const fixed = envelopes.find((e) => e.type === 'fixed');
  if (fixed) return fixed.key;
  const afterTrackers = addTrackerSlot(envelopes);
  if (afterTrackers) return afterTrackers;
  const expenses = envelopes.filter((e) => EXPENSES.has(e.type));
  return expenses[expenses.length - 1]?.key ?? null;
}
