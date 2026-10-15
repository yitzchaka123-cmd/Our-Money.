import type { EnvelopeView } from '@/lib/dashboard/data';
import type { EnvelopeType } from '@/lib/types';

/**
 * "איך חישבנו את הצפי?" — the forecast card's numbers, taken apart. Every
 * figure comes from the same envelopes `monthTotals` builds the forecast
 * from, and in the same way (the tests hold the two equal), so the lines
 * always add up to the number on the card. It stays free of the server
 * loader so the dashboard can call it in the browser.
 *
 *   income + fixed income + cash in − fixed − trackers − variable − savings = forecast
 *
 * Cash out is not a line of its own in that sum: cash spending already sits
 * inside the envelopes above it. It is shown so the couple can see it counted.
 */
export interface ForecastBreakdown {
  /** RiseUp's expected income (what came in, or the plan if more). */
  incomeExpected: number;
  /** Income RiseUp keeps as fixed (a salary): what came in, or the plan if more. */
  fixedIncomeExpected: number;
  /** Cash income: received this month plus what is still due. */
  cashIn: number;
  fixedExpected: number;
  trackersExpected: number;
  variableExpected: number;
  /** The variable envelope spent so far, card and cash. */
  variableSpent: number;
  savingsExpected: number;
  /** Cash spent this month plus cash still due — already inside the expenses. */
  cashOut: number;
  forecast: number;
}

const EXPENSES = new Set<EnvelopeType>(['variable', 'fixed', 'trackingCategory', 'riseupGoal']);

export function forecastBreakdown(envelopes: EnvelopeView[]): ForecastBreakdown {
  const of = (type: EnvelopeType) => envelopes.filter((e) => e.type === type);
  const sum = (list: EnvelopeView[], pick: (e: EnvelopeView) => number) => round(list.reduce((s, e) => s + pick(e), 0));
  const expected = (type: EnvelopeType) => sum(of(type), (e) => e.expected);

  const expenses = envelopes.filter((e) => EXPENSES.has(e.type));
  const cashOut = sum(expenses, (e) => e.actuals.filter((a) => a.cash).reduce((s, a) => s + a.amountIls, 0) + e.pendingTotal);

  const incomeExpected = expected('variableIncome');
  const fixedIncomeExpected = expected('fixedIncome');
  const cashIn = expected('cashIncome');
  const fixedExpected = expected('fixed');
  const trackersExpected = expected('trackingCategory');
  const variableExpected = expected('variable');
  const savingsExpected = expected('riseupGoal');

  return {
    incomeExpected,
    fixedIncomeExpected,
    cashIn,
    fixedExpected,
    trackersExpected,
    variableExpected,
    variableSpent: sum(of('variable'), (e) => e.actual),
    savingsExpected,
    cashOut,
    forecast: round(incomeExpected + fixedIncomeExpected + cashIn - fixedExpected - trackersExpected - variableExpected - savingsExpected),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
