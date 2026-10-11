import type {
  EnvelopeType,
  RiseupBudget,
  RiseupEnvelope,
  RiseupEnvelopeActual,
} from '@/lib/types';
import { resolveTrackerName, type NameBook } from '@/lib/riseup/tracker-names';

export interface NormalizedActual {
  transactionId: string;
  transactionDate: string | null;
  billingDate: string | null;
  businessName: string;
  amountIls: number;
  isIncome: boolean;
  accountNickname: string | null;
  accountNumberHash: string | null;
  source: string | null;
  isInstallment: boolean;
  paymentNumber: number | null;
  totalPayments: number | null;
  categoryLabel: string | null;
  /** Set when the row is a cash entry of ours rather than a RiseUp charge. */
  cash?: {
    id: string;
    kind: 'spend' | 'income';
    memberName: string | null;
    inputKind: 'text' | 'voice' | 'web';
    status: 'confirmed' | 'needs_review';
    walletId: string | null;
  };
}

export interface NormalizedEnvelope {
  envelopeId: string;
  type: EnvelopeType;
  name: string;
  plannedIls: number;
  actualIls: number;
  position: number;
  actuals: NormalizedActual[];
}

/** Display order on the dashboard, matching RiseUp's own top-to-bottom order. */
export const ENVELOPE_ORDER: EnvelopeType[] = [
  'variable',
  'fixed',
  'variableIncome',
  'cashIncome',
  'trackingCategory',
  'riseupGoal',
];

export const ENVELOPE_TITLES: Partial<Record<EnvelopeType, string>> = {
  variableIncome: 'הכנסות',
  variable: 'הוצאות משתנות',
  fixed: 'הוצאות קבועות',
  riseupGoal: 'הפקדות לחיסכון',
  cashIncome: 'הכנסות במזומן',
};

const KNOWN_TYPES = new Set<string>([
  'variableIncome',
  'variable',
  'fixed',
  'trackingCategory',
  'riseupGoal',
]);

function toDateOnly(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}

/**
 * An actual carries its value in `billingAmount` for expenses and
 * `incomeAmount` for incomes — exactly one is non-null — with `originalAmount`
 * as a last resort. All are stored as positive magnitudes.
 */
export function actualAmount(actual: RiseupEnvelopeActual): number {
  const raw =
    actual.billingAmount ?? actual.incomeAmount ?? actual.originalAmount ?? 0;
  return Math.abs(Number(raw) || 0);
}

export function normalizeActual(actual: RiseupEnvelopeActual): NormalizedActual {
  return {
    transactionId: actual.transactionId,
    transactionDate: toDateOnly(actual.transactionDate),
    billingDate: toDateOnly(actual.billingDate),
    businessName: actual.businessName ?? '',
    amountIls: actualAmount(actual),
    isIncome: Boolean(actual.isIncome),
    accountNickname: actual.accountNickname ?? null,
    accountNumberHash: actual.accountNumberHash ?? null,
    source: actual.source ?? null,
    isInstallment: Boolean(actual.isInstallment),
    paymentNumber: actual.paymentNumber ?? null,
    totalPayments: actual.totalNumberOfPayments ?? null,
    categoryLabel: actual.categoryLabel ?? actual.expense ?? null,
  };
}

/**
 * Tracking categories need a display name, and the API sends none — see
 * lib/riseup/tracker-names.ts for the order the name is looked for in. The
 * big envelopes keep RiseUp's fixed titles.
 */
export function envelopeName(envelope: RiseupEnvelope, book?: NameBook | null): string {
  const direct = envelope.name ?? envelope.categoryName ?? envelope.label;
  if (direct && direct.trim()) return direct.trim();

  const titled = ENVELOPE_TITLES[envelope.type];
  if (titled) return titled;

  return resolveTrackerName({
    envelopeId: envelope.id,
    ownLabels: (envelope.actuals ?? []).map((a) => a.categoryLabel ?? a.expense),
    book,
    // The customer's own note is not a name, but it beats a placeholder.
    note: envelope.sequenceCustomerComment,
  });
}

/**
 * Where the plan may sit, in order. Only the first two are documented, and in
 * the real data every tracker and the income envelope come back with a zero
 * `balancedAmount` while RiseUp's own app shows a goal — so a zero is not
 * trusted while another field holds a number. Each sync records which of these
 * fields exist and whether they are zero (`sync_runs.envelope_shape`), so the
 * list can be narrowed to the real one.
 */
export const PLANNED_FIELDS = [
  'balancedAmount',
  'originalAmount',
  'amount',
  'plannedAmount',
  'goal',
  'budget',
  'expectedAmount',
  'predictedAmount',
  'customPrediction',
] as const;

function numeric(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** The planned figure: the first non-zero candidate field, as a magnitude. */
export function plannedAmount(envelope: RiseupEnvelope): number {
  const fields = envelope as unknown as Record<string, unknown>;
  for (const field of PLANNED_FIELDS) {
    const value = numeric(fields[field]);
    if (value !== 0) return Math.abs(value);
  }
  return 0;
}

/**
 * Income that already arrived is income expected: RiseUp's income envelope
 * never expects less than what came in, and with no plan at all it expects
 * exactly that.
 */
export function plannedForType(type: EnvelopeType, planned: number, actual: number): number {
  return type === 'variableIncome' ? Math.max(planned, actual) : planned;
}

export function normalizeEnvelope(
  envelope: RiseupEnvelope,
  position: number,
  book?: NameBook | null,
): NormalizedEnvelope {
  const actuals = (envelope.actuals ?? []).map(normalizeActual);
  const type = KNOWN_TYPES.has(envelope.type) ? envelope.type : 'trackingCategory';
  // Summed rather than read off the envelope: the actuals are unambiguous.
  const actualIls = round(actuals.reduce((total, a) => total + a.amountIls, 0));
  return {
    envelopeId: envelope.id,
    type,
    name: envelopeName(envelope, book),
    plannedIls: round(plannedForType(type, plannedAmount(envelope), actualIls)),
    actualIls,
    position,
    actuals,
  };
}

/** `book` carries names learned in other months, for trackers with no transactions. */
export function normalizeBudget(budget: RiseupBudget, book?: NameBook | null): NormalizedEnvelope[] {
  return (budget.envelopes ?? []).map((envelope, index) =>
    normalizeEnvelope(envelope, index, book),
  );
}

/** Sort into the dashboard's top-to-bottom order, stable within a type. */
export function sortEnvelopes(envelopes: NormalizedEnvelope[]): NormalizedEnvelope[] {
  return [...envelopes].sort((a, b) => {
    const rank = ENVELOPE_ORDER.indexOf(a.type) - ENVELOPE_ORDER.indexOf(b.type);
    return rank !== 0 ? rank : a.position - b.position;
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
