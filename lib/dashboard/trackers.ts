import type { EnvelopeRef } from '@/lib/cash/envelopes';
import type { NormalizedEnvelope } from '@/lib/riseup/envelopes';

/**
 * Our own changes to RiseUp's trackers and expected income, laid over
 * RiseUp's numbers. RiseUp's API is read-only, so a new target, a new name,
 * "stop tracking" or a tracker of our own lives in money.tracker_overrides
 * and is applied here — after RiseUp's own naming, so an override always wins.
 *
 * Two steps, around the point where cash is filed into envelopes:
 *  1. prepareTrackers — names, targets, expected income, and empty trackers
 *     of our own (so a cash spend pinned to one has somewhere to land);
 *  2. settleTrackers — a hidden tracker's spending goes back to variable
 *     expenses, and a tracker of our own collects the variable spending with
 *     its category label.
 *
 * Both moves keep the money in the forecast: a tracker of ours is carved out
 * of the variable budget, and a hidden one gives its budget back to it.
 */

export const INCOME_KEY = 'income';
export const CUSTOM_PREFIX = 'custom:';

export interface TrackerOverride {
  trackerKey: string;
  /** '' for every month, or YYYY-MM for that month only. */
  month: string;
  name: string | null;
  targetIls: number | null;
  hidden: boolean;
  categoryLabel: string | null;
}

export interface TrackerOverrideRow {
  tracker_key: string;
  month: string | null;
  name: string | null;
  target_ils: number | string | null;
  hidden: boolean | null;
  category_label: string | null;
}

/** What the dashboard tells the couple about an envelope we changed. */
export interface OverrideInfo {
  /** A tracker we added; RiseUp does not know it. */
  custom: boolean;
  /** RiseUp's own name and target, before ours. */
  riseupName: string | null;
  riseupTarget: number | null;
  renamed: boolean;
  retargeted: boolean;
  /** The target applies to this month only. */
  monthOnly: boolean;
  categoryLabel: string | null;
}

export function toOverrides(rows: TrackerOverrideRow[] | null | undefined): TrackerOverride[] {
  return (rows ?? []).map((row) => ({
    trackerKey: row.tracker_key,
    month: row.month ?? '',
    name: row.name?.trim() || null,
    targetIls: row.target_ils === null || row.target_ils === undefined ? null : Number(row.target_ils),
    hidden: Boolean(row.hidden),
    categoryLabel: row.category_label?.trim() || null,
  }));
}

/**
 * RiseUp's envelope ids change every month
 * (`2026-10#trackingCategory#v2-default-il-expense-category-2#0`); the third
 * `#` part names the tracker and stays put. Anything else is its own key.
 */
export function trackerKey(envelopeId: string): string {
  if (envelopeId.startsWith(CUSTOM_PREFIX)) return envelopeId;
  const parts = envelopeId.split('#');
  return parts.length >= 3 && parts[2] ? parts[2] : envelopeId;
}

export function customKey(label: string): string {
  return `${CUSTOM_PREFIX}${label.trim()}`;
}

export function isCustomKey(key: string): boolean {
  return key.startsWith(CUSTOM_PREFIX);
}

export interface ResolvedOverride {
  name: string | null;
  targetIls: number | null;
  monthOnly: boolean;
  hidden: boolean;
  categoryLabel: string | null;
}

/** The '' row, with a target for this month on top of it. */
export function resolveOverride(
  overrides: TrackerOverride[],
  key: string,
  month: string,
): ResolvedOverride | null {
  const always = overrides.find((o) => o.trackerKey === key && o.month === '');
  const thisMonth = overrides.find((o) => o.trackerKey === key && o.month === month);
  if (!always && !thisMonth) return null;
  const monthTarget = thisMonth?.targetIls ?? null;
  return {
    name: always?.name ?? thisMonth?.name ?? null,
    targetIls: monthTarget ?? always?.targetIls ?? null,
    monthOnly: monthTarget !== null,
    hidden: always?.hidden ?? false,
    categoryLabel: always?.categoryLabel ?? null,
  };
}

function norm(label: string | null | undefined): string {
  return (label ?? '').trim().replace(/\s+/g, ' ');
}

function sum(envelope: NormalizedEnvelope): number {
  return round(envelope.actuals.reduce((s, a) => s + a.amountIls, 0));
}

/** Step 1: names, targets, expected income, and empty trackers of our own. */
export function prepareTrackers(
  envelopes: NormalizedEnvelope[],
  overrides: TrackerOverride[],
  month: string,
): { envelopes: NormalizedEnvelope[]; info: Map<string, OverrideInfo> } {
  const info = new Map<string, OverrideInfo>();
  if (overrides.length === 0) return { envelopes, info };

  const list = envelopes.map((envelope): NormalizedEnvelope => {
    if (envelope.type === 'variableIncome') return envelope;
    if (envelope.type !== 'trackingCategory') return envelope;
    const o = resolveOverride(overrides, trackerKey(envelope.envelopeId), month);
    if (!o) return envelope;
    const renamed = o.name !== null && o.name !== envelope.name;
    const retargeted = o.targetIls !== null && o.targetIls !== envelope.plannedIls;
    info.set(envelope.envelopeId, {
      custom: false,
      riseupName: envelope.name,
      riseupTarget: envelope.plannedIls,
      renamed,
      retargeted,
      monthOnly: o.monthOnly,
      categoryLabel: null,
    });
    return {
      ...envelope,
      name: o.name ?? envelope.name,
      plannedIls: o.targetIls ?? envelope.plannedIls,
    };
  });

  // Expected income: ours replaces RiseUp's, but never below what came in.
  const income = list.find((e) => e.type === 'variableIncome');
  const incomeOverride = resolveOverride(overrides, INCOME_KEY, month);
  if (income && incomeOverride?.targetIls !== null && incomeOverride?.targetIls !== undefined) {
    const index = list.indexOf(income);
    info.set(income.envelopeId, {
      custom: false,
      riseupName: income.name,
      riseupTarget: income.plannedIls,
      renamed: false,
      retargeted: true,
      monthOnly: incomeOverride.monthOnly,
      categoryLabel: null,
    });
    list[index] = { ...income, plannedIls: round(Math.max(incomeOverride.targetIls, income.actualIls)) };
  }

  // Trackers of our own: one per custom key, unless RiseUp already tracks it.
  const tracked = new Set(
    list.filter((e) => e.type === 'trackingCategory').map((e) => norm(e.name)),
  );
  const customKeys = [...new Set(overrides.filter((o) => isCustomKey(o.trackerKey)).map((o) => o.trackerKey))];
  let position = Math.max(0, ...list.map((e) => e.position)) + 1;
  for (const key of customKeys) {
    const o = resolveOverride(overrides, key, month);
    if (!o || o.hidden) continue;
    const label = o.categoryLabel ?? key.slice(CUSTOM_PREFIX.length);
    if (!label || tracked.has(norm(label))) continue;
    tracked.add(norm(label));
    const name = o.name ?? label;
    list.push({
      envelopeId: key,
      type: 'trackingCategory',
      name,
      plannedIls: o.targetIls ?? 0,
      actualIls: 0,
      position: position++,
      actuals: [],
    });
    info.set(key, {
      custom: true,
      riseupName: null,
      riseupTarget: null,
      renamed: name !== label,
      retargeted: false,
      monthOnly: o.monthOnly,
      categoryLabel: label,
    });
  }

  return { envelopes: list, info };
}

/**
 * Step 2, once cash is filed in: hidden trackers hand their spending (and
 * budget) back to variable expenses, and trackers of our own collect the
 * variable spending with their label (and take their budget from it).
 */
export function settleTrackers(
  envelopes: NormalizedEnvelope[],
  overrides: TrackerOverride[],
  info: Map<string, OverrideInfo>,
  month: string,
): NormalizedEnvelope[] {
  if (overrides.length === 0) return envelopes;
  let list = envelopes.map((e) => ({ ...e, actuals: [...e.actuals] }));
  const variable = list.find((e) => e.type === 'variable');

  const hidden = list.filter(
    (e) =>
      e.type === 'trackingCategory' &&
      !isCustomKey(e.envelopeId) &&
      resolveOverride(overrides, trackerKey(e.envelopeId), month)?.hidden,
  );
  if (hidden.length > 0 && variable) {
    for (const tracker of hidden) {
      variable.actuals.push(...tracker.actuals);
      variable.plannedIls = round(variable.plannedIls + tracker.plannedIls);
    }
    list = list.filter((e) => !hidden.includes(e));
  }
  // With no variable envelope to hand them to, hidden trackers stay: better
  // shown than losing their money from the totals.

  for (const tracker of list) {
    const meta = info.get(tracker.envelopeId);
    if (!meta?.custom || !meta.categoryLabel || !variable) continue;
    const label = norm(meta.categoryLabel);
    const mine = variable.actuals.filter((a) => norm(a.categoryLabel) === label);
    if (mine.length > 0) {
      variable.actuals = variable.actuals.filter((a) => !mine.includes(a));
      tracker.actuals.push(...mine);
    }
    variable.plannedIls = round(Math.max(variable.plannedIls - tracker.plannedIls, 0));
  }

  return list.map((e) => ({ ...e, actualIls: sum(e) }));
}

/**
 * Trackers of our own as cash can be filed into them, for code that reads
 * the month's envelopes straight from the database (cash actions, the bot).
 */
export function customTrackerRefs(
  overrides: TrackerOverride[],
  month: string,
  riseup: EnvelopeRef[],
): EnvelopeRef[] {
  const tracked = new Set(riseup.filter((e) => e.type === 'trackingCategory').map((e) => norm(e.name)));
  const keys = [...new Set(overrides.filter((o) => isCustomKey(o.trackerKey)).map((o) => o.trackerKey))];
  return keys.flatMap((key): EnvelopeRef[] => {
    const o = resolveOverride(overrides, key, month);
    const label = o?.categoryLabel ?? key.slice(CUSTOM_PREFIX.length);
    if (!o || o.hidden || !label || tracked.has(norm(label))) return [];
    tracked.add(norm(label));
    return [{ envelopeId: key, type: 'trackingCategory', name: o.name ?? label, categoryLabels: [label] }];
  });
}

/**
 * Which card "הוספת קטגוריה למעקב" follows: the last tracker, as in RiseUp,
 * or the variable card when nothing is tracked yet.
 */
export function addTrackerSlot(envelopes: { key: string; type: string }[]): string | null {
  const trackers = envelopes.filter((e) => e.type === 'trackingCategory');
  return (trackers[trackers.length - 1] ?? envelopes.find((e) => e.type === 'variable'))?.key ?? null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
