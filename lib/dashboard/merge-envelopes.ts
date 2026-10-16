import { ENVELOPE_TITLES, type NormalizedEnvelope, type UpcomingCharge } from '@/lib/riseup/envelopes';
import { envelopeKey, envelopePart, type NameBook } from '@/lib/riseup/tracker-names';

/**
 * RiseUp's budget sends one `fixed` envelope per fixed charge (28 in October
 * 2026) and splits a weekly tracker into one envelope per week. Its app shows
 * one "הוצאות קבועות" card and one card per tracker, so this folds them the
 * same way:
 *
 * - every fixed envelope → one, its actuals together, its plan the sum of
 *   theirs, and each charge that is planned but not charged yet listed as
 *   "upcoming", named from the same charge in earlier months;
 * - a fixed envelope whose charges are income (a salary the couple marked as
 *   fixed income in RiseUp) is not an expense: those fold into one
 *   "הכנסות קבועות" envelope of type `fixedIncome` instead — see
 *   `isFixedIncome`;
 * - tracker envelopes sharing a category key → one, marked weekly when RiseUp
 *   split it into parts.
 *
 * The merged envelope keeps the id of its first part, so cash filed into it
 * has a real id; `aliases` maps every folded-away id to it.
 */
export function mergeRiseupEnvelopes(
  envelopes: NormalizedEnvelope[],
  names?: NameBook | null,
): { envelopes: NormalizedEnvelope[]; aliases: Map<string, string> } {
  const aliases = new Map<string, string>();
  const groups = new Map<string, NormalizedEnvelope[]>();
  const order: string[] = [];

  for (const envelope of [...envelopes].sort((a, b) => a.position - b.position)) {
    const group = groupOf(envelope, names);
    if (!groups.has(group)) {
      groups.set(group, []);
      order.push(group);
    }
    groups.get(group)!.push(envelope);
  }

  const merged = order.map((group) => {
    const parts = groups.get(group)!;
    const [first] = parts as [NormalizedEnvelope, ...NormalizedEnvelope[]];
    for (const part of parts.slice(1)) aliases.set(part.envelopeId, first.envelopeId);

    if (group === 'fixedIncome') return mergeFixed(parts, names, 'fixedIncome');
    if (first.type === 'fixed') return mergeFixed(parts, names, 'fixed');
    if (parts.length === 1) return first;
    const weekPlans = weekPlansOf(parts);
    return {
      ...first,
      plannedIls: round(sum(parts.map((p) => p.plannedIls))),
      actualIls: round(sum(parts.map((p) => p.actualIls))),
      actuals: parts.flatMap((p) => p.actuals),
      weekly: weekPlans ? true : undefined,
      ...(weekPlans ? { weekPlans } : {}),
    };
  });

  return { envelopes: merged, aliases };
}

/**
 * RiseUp sends fixed income in the same `fixed` group as fixed expenses. An
 * envelope is income when every charge in it came in as income; one with no
 * charge yet this month is income when the same charge (its key stays the
 * same from month to month) came in as income in its latest earlier month.
 */
export function isFixedIncome(envelope: NormalizedEnvelope, names?: NameBook | null): boolean {
  if (envelope.type !== 'fixed') return false;
  const riseup = envelope.actuals.filter((a) => !a.cash);
  if (riseup.length > 0) {
    if (!riseup.every((a) => a.isIncome)) return false;
    // A lone refund in an expense (a small credit) is not income: the money
    // that came in must be a real part of what the envelope plans.
    const cameIn = riseup.reduce((sum, a) => sum + a.amountIls, 0);
    return envelope.plannedIls <= 0 || cameIn >= envelope.plannedIls / 2;
  }
  const key = envelopeKey(envelope.envelopeId);
  return Boolean(key && names?.fixed.get(key)?.income);
}

function groupOf(envelope: NormalizedEnvelope, names?: NameBook | null): string {
  if (isFixedIncome(envelope, names)) return 'fixedIncome';
  if (envelope.type === 'fixed') return 'fixed';
  if (envelope.type === 'trackingCategory') {
    const key = envelopeKey(envelope.envelopeId);
    if (key) return `tracker:${key}`;
  }
  return `own:${envelope.envelopeId}`;
}

function mergeFixed(
  parts: NormalizedEnvelope[],
  names: NameBook | null | undefined,
  type: 'fixed' | 'fixedIncome',
): NormalizedEnvelope {
  const first = parts[0]!;
  const income = type === 'fixedIncome';
  const upcoming: UpcomingCharge[] = parts
    .filter((p) => p.actualIls <= 0 && p.plannedIls > 0)
    .map((p) => {
      const key = envelopeKey(p.envelopeId);
      const known = key ? names?.fixed.get(key) : undefined;
      return {
        key: p.envelopeId,
        amountIls: p.plannedIls,
        categoryLabel: known?.label ?? null,
        businessName: known?.businessName ?? null,
      };
    });

  return {
    ...first,
    type,
    name: ENVELOPE_TITLES[type] ?? first.name,
    // Income that came in is income expected, as on RiseUp's income card.
    plannedIls: round(sum(parts.map((p) => (income ? Math.max(p.plannedIls, p.actualIls) : p.plannedIls)))),
    actualIls: round(sum(parts.map((p) => p.actualIls))),
    actuals: parts.flatMap((p) => p.actuals),
    upcoming,
  };
}

/** A weekly tracker's plan per week, from its `#k` parts; null when it has none. */
function weekPlansOf(parts: NormalizedEnvelope[]): number[] | undefined {
  const indexed = parts
    .map((p) => ({ k: envelopePart(p.envelopeId), planned: p.plannedIls }))
    .filter((p): p is { k: number; planned: number } => p.k !== null);
  if (indexed.length === 0) return undefined;
  const plans = new Array<number>(Math.max(...indexed.map((p) => p.k)) + 1).fill(0);
  for (const { k, planned } of indexed) plans[k] = round(plans[k]! + planned);
  return plans;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
