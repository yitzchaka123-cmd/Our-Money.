import type { RiseupBudget } from '@/lib/types';

/**
 * What a sync saw in RiseUp's budget payload: field names and the kind of
 * value each held — never a value. Numbers say only whether they were zero,
 * which is what tells us which field really carries a tracker's goal (#12).
 * Stored once per run in `sync_runs.envelope_shape`.
 */
export interface EnvelopeShape {
  budget: Record<string, string>;
  envelopes: Record<string, { count: number; fields: Record<string, string> }>;
  actuals: Record<string, string>;
}

const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,59}$/;
const TYPE_NAME = /^[A-Za-z]{1,40}$/;
const MAX_FIELDS = 80;

function kindOf(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return value === 0 ? 'number:zero' : 'number:nonzero';
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'object') return typeof value;
  return 'other';
}

type Kinds = Map<string, Set<string>>;

function collect(into: Kinds, record: unknown): void {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return;
  for (const [field, value] of Object.entries(record as Record<string, unknown>)) {
    // A key that does not look like a field name could be data; skip it.
    if (!FIELD_NAME.test(field)) continue;
    if (!into.has(field) && into.size >= MAX_FIELDS) continue;
    const kinds = into.get(field) ?? new Set<string>();
    kinds.add(kindOf(value));
    into.set(field, kinds);
  }
}

function render(kinds: Kinds): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of [...kinds.keys()].sort()) {
    const set = new Set(kinds.get(field));
    if (set.has('number:zero') && set.has('number:nonzero')) {
      set.delete('number:zero');
      set.delete('number:nonzero');
      set.add('number:mixed');
    }
    out[field] = [...set].sort().join('|');
  }
  return out;
}

export function envelopeShape(budgets: RiseupBudget[]): EnvelopeShape {
  const budget: Kinds = new Map();
  const actuals: Kinds = new Map();
  const byType = new Map<string, { count: number; kinds: Kinds }>();

  for (const payload of budgets) {
    collect(budget, payload);
    for (const envelope of payload?.envelopes ?? []) {
      const type = typeof envelope?.type === 'string' && TYPE_NAME.test(envelope.type) ? envelope.type : 'other';
      const entry = byType.get(type) ?? { count: 0, kinds: new Map() };
      entry.count += 1;
      collect(entry.kinds, envelope);
      byType.set(type, entry);
      for (const actual of envelope?.actuals ?? []) collect(actuals, actual);
    }
  }

  const envelopes: EnvelopeShape['envelopes'] = {};
  for (const type of [...byType.keys()].sort()) {
    const entry = byType.get(type)!;
    envelopes[type] = { count: entry.count, fields: render(entry.kinds) };
  }
  return { budget: render(budget), envelopes, actuals: render(actuals) };
}
