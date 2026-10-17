import type { EnvelopeView } from '@/lib/dashboard/data';

/**
 * RiseUp shows one "הכנסות" card. Since the salary is marked as fixed income
 * in RiseUp it arrives as an envelope of its own (`fixedIncome`, see
 * lib/dashboard/merge-envelopes.ts), beside RiseUp's income envelope
 * (`variableIncome`). The data keeps them apart — the forecast, its sheet,
 * the insights, the brief, search and the assistant each count every
 * envelope once — and only the dashboard draws them as one card (C34):
 * where RiseUp's income card stands, with both inside.
 *
 * The cash income card ("הכנסות במזומן") stays a card of its own.
 */
export interface IncomeCardParts {
  /** The envelope whose place the card takes: the variable one when there is one. */
  hostKey: string;
  /** The envelope not drawn on its own, now inside the card; null when there is none. */
  hidden: string | null;
  variable: EnvelopeView | null;
  fixed: EnvelopeView | null;
  /** נכנס: both kinds together. */
  actual: number;
  /** צפוי להיכנס: both kinds together — the same sum the forecast counts. */
  expected: number;
}

export function incomeCard(envelopes: EnvelopeView[]): IncomeCardParts | null {
  const variable = envelopes.find((e) => e.type === 'variableIncome') ?? null;
  const fixed = envelopes.find((e) => e.type === 'fixedIncome') ?? null;
  const host = variable ?? fixed;
  if (!host) return null;
  const parts = [variable, fixed].filter((e): e is EnvelopeView => e !== null);
  return {
    hostKey: host.key,
    hidden: variable && fixed ? fixed.key : null,
    variable,
    fixed,
    actual: round(parts.reduce((s, e) => s + e.actual, 0)),
    expected: round(parts.reduce((s, e) => s + e.expected, 0)),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
