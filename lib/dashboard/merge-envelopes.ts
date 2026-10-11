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
    const group = groupOf(envelope);
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

    if (first.type === 'fixed') return mergeFixed(parts, names);
    if (parts.length === 1) return first;
    return {
      ...first,
      plannedIls: round(sum(parts.map((p) => p.plannedIls))),
      actualIls: round(sum(parts.map((p) => p.actualIls))),
      actuals: parts.flatMap((p) => p.actuals),
      weekly: parts.some((p) => envelopePart(p.envelopeId) !== null) || undefined,
    };
  });

  return { envelopes: merged, aliases };
}

function groupOf(envelope: NormalizedEnvelope): string {
  if (envelope.type === 'fixed') return 'fixed';
  if (envelope.type === 'trackingCategory') {
    const key = envelopeKey(envelope.envelopeId);
    if (key) return `tracker:${key}`;
  }
  return `own:${envelope.envelopeId}`;
}

function mergeFixed(parts: NormalizedEnvelope[], names?: NameBook | null): NormalizedEnvelope {
  const first = parts[0]!;
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
    name: ENVELOPE_TITLES.fixed ?? first.name,
    plannedIls: round(sum(parts.map((p) => p.plannedIls))),
    actualIls: round(sum(parts.map((p) => p.actualIls))),
    actuals: parts.flatMap((p) => p.actuals),
    upcoming,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
