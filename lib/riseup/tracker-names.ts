/**
 * Names for RiseUp's tracking categories.
 *
 * The budget API sends no name for a tracker, only an id such as
 * `2026-10#trackingCategory#v2-default-il-expense-category-13#0`. Its third
 * `#` part is the category and stays the same from month to month, so a name
 * learned in one month names the tracker in every other. In order:
 *
 *   1. a name field on the envelope itself (none is documented, but if one
 *      ever appears it wins);
 *   2. the category label most used on its own transactions this month;
 *   3. the same category's name in any other month (stored envelope names and
 *      the labels on that month's transactions);
 *   4. RiseUp's built-in category names;
 *   5. a neutral "קטגוריה למעקב" — never the raw id.
 *
 * Pure, so the sync, the loader and the tests share it.
 */

export const TRACKER_FALLBACK_NAME = 'קטגוריה למעקב';

/** RiseUp's built-in expense categories, as seen on real trackers. */
export const BUILTIN_TRACKER_NAMES: Readonly<Record<string, string>> = {
  'v2-default-il-expense-category-2': 'כלכלה',
  'v2-default-il-expense-category-3': 'פנאי',
  'v2-default-il-expense-category-9': 'אוכל בחוץ',
  'v2-default-il-expense-category-10': 'חינוך',
  'v2-default-il-expense-category-13': 'רכב',
  'v2-default-il-expense-category-16': 'עמלות',
  'v2-default-il-expense-category-28': 'ביגוד והנעלה',
  'v2-default-il-expense-category-33': 'פארמה',
};

/** The month-independent part of an envelope id, or null for the big envelopes. */
export function envelopeKey(envelopeId: string): string | null {
  const key = envelopeId.split('#')[2];
  return key && key.trim() ? key : null;
}

/** The `#n` part a weekly tracker splits into (`…category-2#3` → 3), or null. */
export function envelopePart(envelopeId: string): number | null {
  const part = envelopeId.split('#')[3];
  return part !== undefined && /^\d+$/.test(part) ? Number(part) : null;
}

/** True for a stored name that is really an id, or the neutral placeholder. */
export function isUnresolvedName(name: string | null | undefined): boolean {
  if (!name || !name.trim()) return true;
  const value = name.trim();
  return value === TRACKER_FALLBACK_NAME || value.includes('#') || /^v2-[\w-]+$/.test(value);
}

function clean(label: string | null | undefined): string | null {
  const value = label?.trim().replace(/\s+/g, ' ');
  return value && !isUnresolvedName(value) ? value : null;
}

/** The most frequent label; a tie goes to `prefer`, then to the first seen. */
export function mostCommon(labels: Array<string | null | undefined>, prefer?: string | null): string | null {
  const counts = new Map<string, number>();
  for (const raw of labels) {
    const label = clean(raw);
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [label, count] of counts) {
    if (count > bestCount || (count === bestCount && label === prefer)) {
      best = label;
      bestCount = count;
    }
  }
  return best;
}

/** What the other months taught us, by envelope key. */
export interface NameBook {
  /** Tracker key → its name. */
  trackers: Map<string, string>;
  /** Fixed charge key → the category and merchant it was charged under. */
  fixed: Map<string, { label: string | null; businessName: string | null }>;
}

export interface NameBookInput {
  envelopes: Array<{ envelope_id: string; envelope_type: string; name: string | null }>;
  actuals: Array<{
    envelope_id: string;
    category_label: string | null;
    business_name?: string | null;
    transaction_date?: string | null;
  }>;
}

export function emptyNameBook(): NameBook {
  return { trackers: new Map(), fixed: new Map() };
}

function typeOf(envelopeId: string): string | undefined {
  return envelopeId.split('#')[1];
}

export function buildNameBook({ envelopes, actuals }: NameBookInput): NameBook {
  const trackerLabels = new Map<string, string[]>();
  const fixedRows = new Map<string, NameBookInput['actuals']>();

  for (const actual of actuals) {
    const key = envelopeKey(actual.envelope_id);
    if (!key) continue;
    const type = typeOf(actual.envelope_id);
    if (type === 'trackingCategory') {
      trackerLabels.set(key, [...(trackerLabels.get(key) ?? []), actual.category_label ?? '']);
    } else if (type === 'fixed') {
      fixedRows.set(key, [...(fixedRows.get(key) ?? []), actual]);
    }
  }

  const trackers = new Map<string, string>();
  for (const [key, labels] of trackerLabels) {
    const name = mostCommon(labels, BUILTIN_TRACKER_NAMES[key]);
    if (name) trackers.set(key, name);
  }
  // A stored name fills in for a key whose transactions taught us nothing.
  for (const row of envelopes) {
    if (row.envelope_type !== 'trackingCategory') continue;
    const key = envelopeKey(row.envelope_id);
    const name = clean(row.name);
    if (key && name && !trackers.has(key)) trackers.set(key, name);
  }

  const fixed: NameBook['fixed'] = new Map();
  for (const [key, rows] of fixedRows) {
    const latest = [...rows].sort((a, b) => (b.transaction_date ?? '').localeCompare(a.transaction_date ?? ''))[0];
    fixed.set(key, {
      label: mostCommon(rows.map((r) => r.category_label)),
      businessName: latest?.business_name?.trim() || null,
    });
  }

  return { trackers, fixed };
}

export function resolveTrackerName({
  envelopeId,
  direct,
  ownLabels,
  book,
  note,
}: {
  envelopeId: string;
  direct?: string | null;
  ownLabels: Array<string | null | undefined>;
  book?: NameBook | null;
  /** The customer's note on the envelope: a last resort before the placeholder. */
  note?: string | null;
}): string {
  const own = clean(direct);
  if (own) return own;

  const key = envelopeKey(envelopeId);
  const builtin = key ? BUILTIN_TRACKER_NAMES[key] : undefined;

  return (
    mostCommon(ownLabels, builtin) ??
    (key ? book?.trackers.get(key) : undefined) ??
    builtin ??
    clean(note) ??
    TRACKER_FALLBACK_NAME
  );
}
