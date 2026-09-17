import type {
  EnvelopeType,
  RiseupBudget,
  RiseupEnvelope,
  RiseupEnvelopeActual,
} from '@/lib/types';

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
 * Tracking categories need a display name, and the field carrying it is not
 * documented — so try every plausible one before falling back to the category
 * label on the envelope's own transactions, and only then to the raw id.
 * `scripts/probe-riseup.ts` prints the real shape once a token is configured.
 */
export function envelopeName(envelope: RiseupEnvelope): string {
  const direct =
    envelope.name ??
    envelope.categoryName ??
    envelope.label ??
    envelope.sequenceCustomerComment;
  if (direct && direct.trim()) return direct.trim();

  const titled = ENVELOPE_TITLES[envelope.type];
  if (titled) return titled;

  const fromActuals = (envelope.actuals ?? [])
    .map((a) => a.categoryLabel ?? a.expense)
    .find((label) => label && label.trim());
  if (fromActuals) return fromActuals.trim();

  return envelope.id;
}

/**
 * The planned figure. `balancedAmount` and `originalAmount` are documented
 * inconsistently (each is described as the plan in one place and the actual in
 * another), so prefer the first that is present and treat it as a magnitude.
 */
export function plannedAmount(envelope: RiseupEnvelope): number {
  const raw = envelope.balancedAmount ?? envelope.originalAmount ?? 0;
  return Math.abs(Number(raw) || 0);
}

export function normalizeEnvelope(
  envelope: RiseupEnvelope,
  position: number,
): NormalizedEnvelope {
  const actuals = (envelope.actuals ?? []).map(normalizeActual);
  return {
    envelopeId: envelope.id,
    type: KNOWN_TYPES.has(envelope.type) ? envelope.type : 'trackingCategory',
    name: envelopeName(envelope),
    plannedIls: round(plannedAmount(envelope)),
    // Summed rather than read off the envelope: the actuals are unambiguous.
    actualIls: round(actuals.reduce((total, a) => total + a.amountIls, 0)),
    position,
    actuals,
  };
}

export function normalizeBudget(budget: RiseupBudget): NormalizedEnvelope[] {
  return (budget.envelopes ?? []).map((envelope, index) =>
    normalizeEnvelope(envelope, index),
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
