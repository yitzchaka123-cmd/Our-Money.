import type { EnvelopeType } from '@/lib/types';

/** The minimum a caller needs to know about an envelope to file cash into it. */
export interface EnvelopeRef {
  envelopeId: string;
  type: EnvelopeType;
  name: string;
  /** Category labels seen on this envelope's own transactions. */
  categoryLabels?: string[];
}

/** What the picker offers: the two big envelopes first, then every tracker. */
export function envelopeChoices(envelopes: EnvelopeRef[]): EnvelopeRef[] {
  const rank = (type: EnvelopeType): number =>
    type === 'variable' ? 0 : type === 'fixed' ? 1 : type === 'trackingCategory' ? 2 : 9;
  return envelopes
    .filter((e) => rank(e.type) < 9)
    .sort((a, b) => rank(a.type) - rank(b.type) || a.name.localeCompare(b.name, 'he'));
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
