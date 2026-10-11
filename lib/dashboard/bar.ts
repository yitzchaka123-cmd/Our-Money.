/**
 * How full an envelope's bar is, 0 to 1. An envelope with nothing planned and
 * nothing spent is empty, as in RiseUp; one with nothing planned but money
 * already out reads as fully used (over budget).
 */
export function barRatio(actual: number, expected: number): number {
  const spent = Number.isFinite(actual) && actual > 0 ? actual : 0;
  if (spent === 0) return 0;
  if (!(expected > 0)) return 1;
  return Math.min(spent / expected, 1);
}
