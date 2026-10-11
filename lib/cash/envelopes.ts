import { envelopeKey, isUnresolvedName, resolveTrackerName } from '@/lib/riseup/tracker-names';
import type { EnvelopeType } from '@/lib/types';

/** The minimum a caller needs to know about an envelope to file cash into it. */
export interface EnvelopeRef {
  envelopeId: string;
  type: EnvelopeType;
  name: string;
  /** Category labels seen on this envelope's own transactions. */
  categoryLabels?: string[];
}

/**
 * What the picker offers: the two big envelopes first, then every tracker —
 * each once. RiseUp stores one fixed envelope per charge and splits a weekly
 * tracker into parts; a picker shows one "הוצאות קבועות" and one row per
 * tracker, named (never a raw id), with the parts' category labels together.
 */
export function envelopeChoices(envelopes: EnvelopeRef[]): EnvelopeRef[] {
  const rank = (type: EnvelopeType): number =>
    type === 'variable' ? 0 : type === 'fixed' ? 1 : type === 'trackingCategory' ? 2 : 9;

  const once = new Map<string, EnvelopeRef>();
  for (const envelope of envelopes) {
    if (rank(envelope.type) >= 9) continue;
    const group =
      envelope.type === 'trackingCategory'
        ? `tracker:${envelopeKey(envelope.envelopeId) ?? envelope.envelopeId}`
        : envelope.type;
    const seen = once.get(group);
    if (!seen) {
      const name =
        envelope.type === 'trackingCategory' && isUnresolvedName(envelope.name)
          ? resolveTrackerName({ envelopeId: envelope.envelopeId, ownLabels: envelope.categoryLabels ?? [] })
          : envelope.name;
      once.set(group, { ...envelope, name });
    } else if (envelope.categoryLabels?.length) {
      seen.categoryLabels = [...new Set([...(seen.categoryLabels ?? []), ...envelope.categoryLabels])];
    }
  }

  return [...once.values()].sort((a, b) => rank(a.type) - rank(b.type) || a.name.localeCompare(b.name, 'he'));
}

function norm(label: string): string {
  return label.trim().replace(/\s+/g, ' ');
}

/**
 * Where a cash spend with this category label belongs, following RiseUp's own
 * rules: a tracking category with that name wins; a label RiseUp has already
 * used inside the fixed envelope goes there; everything else is a variable
 * expense — which is exactly what RiseUp does with an uncategorised charge.
 */
export function resolveEnvelopeForCategory(
  envelopes: EnvelopeRef[],
  category: string | null | undefined,
): EnvelopeRef | null {
  const label = category ? norm(category) : '';

  if (label) {
    const tracker = envelopes.find(
      (e) => e.type === 'trackingCategory' && norm(e.name) === label,
    );
    if (tracker) return tracker;

    const fixed = envelopes.find(
      (e) => e.type === 'fixed' && (e.categoryLabels ?? []).some((l) => norm(l) === label),
    );
    if (fixed) return fixed;
  }

  return envelopes.find((e) => e.type === 'variable') ?? null;
}
