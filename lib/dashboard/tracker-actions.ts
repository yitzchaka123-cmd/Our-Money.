'use server';

import { revalidatePath } from 'next/cache';

import { SESSION_EXPIRED_MESSAGE, sessionMember } from '@/lib/auth/member';
import { moveCashEntryToMonth } from '@/lib/cash/actions';
import { db } from '@/lib/db/client';
import {
  customKey,
  INCOME_KEY,
  isCustomKey,
  toOverrides,
  trackerKey,
  type TrackerOverrideRow,
} from '@/lib/dashboard/trackers';

/**
 * Changes to trackers and expected income. RiseUp's API is read-only, so
 * each of these writes our own override (money.tracker_overrides), which the
 * dashboard lays over RiseUp's numbers. RiseUp itself never changes.
 */

export type TrackerResult = { ok: true } | { ok: false; error: string };

const MONTH = /^\d{4}-\d{2}$/;
const SAVE_FAILED = 'משהו השתבש בשמירה. נסו שוב בעוד רגע.';

function fail(error: string): TrackerResult {
  return { ok: false, error };
}

function validKey(key: string): boolean {
  return typeof key === 'string' && key.length > 0 && key.length <= 200;
}

function validAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 10_000_000;
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

async function upsert(row: Record<string, unknown>, memberId: string): Promise<TrackerResult> {
  const { error } = await db()
    .from('tracker_overrides')
    .upsert(
      { month: '', ...row, updated_by: memberId, updated_at: new Date().toISOString() },
      { onConflict: 'tracker_key,month' },
    );
  if (error) {
    console.error('Tracker override failed:', error.message);
    return fail(SAVE_FAILED);
  }
  return { ok: true };
}

async function drop(key: string, month: string): Promise<TrackerResult> {
  const { error } = await db().from('tracker_overrides').delete().eq('tracker_key', key).eq('month', month);
  if (error) {
    console.error('Tracker override delete failed:', error.message);
    return fail(SAVE_FAILED);
  }
  return { ok: true };
}

function done(result: TrackerResult): TrackerResult {
  if (result.ok) revalidatePath('/dashboard');
  return result;
}

/**
 * RiseUp's "עריכת סכום". A target for `month` only, or from now on; null
 * goes back to RiseUp's own (automatic) target.
 */
export async function setTrackerTarget(
  key: string,
  targetIls: number | null,
  month: string,
  onlyThisMonth: boolean,
): Promise<TrackerResult> {
  const member = await sessionMember();
  if (!member) return fail(SESSION_EXPIRED_MESSAGE);
  if (!validKey(key) || key === INCOME_KEY) return fail('קטגוריה לא מוכרת.');
  if (!MONTH.test(month)) return fail('חודש לא תקין.');
  if (targetIls !== null && !validAmount(targetIls)) return fail('צריך סכום של אפס ומעלה.');

  if (targetIls === null) {
    const cleared = await drop(key, month);
    if (!cleared.ok) return cleared;
    // A tracker of ours has no RiseUp target to go back to: it keeps its own.
    if (isCustomKey(key)) return done(cleared);
    return done(await upsert({ tracker_key: key, target_ils: null }, member));
  }
  if (onlyThisMonth) return done(await upsert({ tracker_key: key, month, target_ils: targetIls }, member));

  const saved = await upsert({ tracker_key: key, target_ils: targetIls }, member);
  if (!saved.ok) return saved;
  // From now on means this month too.
  return done(await drop(key, month));
}

/** RiseUp's "עריכת שם". Null goes back to the automatic name. */
export async function renameTracker(key: string, name: string | null): Promise<TrackerResult> {
  const member = await sessionMember();
  if (!member) return fail(SESSION_EXPIRED_MESSAGE);
  if (!validKey(key) || key === INCOME_KEY) return fail('קטגוריה לא מוכרת.');
  const clean = name === null ? null : cleanName(name);
  if (clean !== null && (clean.length < 1 || clean.length > 60)) return fail('צריך שם באורך 1 עד 60 תווים.');
  return done(await upsert({ tracker_key: key, name: clean }, member));
}

/** RiseUp's "מחיקה מהתזרים", kept on our side; false brings it back. */
export async function hideTracker(key: string, hidden = true): Promise<TrackerResult> {
  const member = await sessionMember();
  if (!member) return fail(SESSION_EXPIRED_MESSAGE);
  if (!validKey(key) || key === INCOME_KEY) return fail('קטגוריה לא מוכרת.');
  return done(await upsert({ tracker_key: key, hidden }, member));
}

/** "הוספת קטגוריה למעקב": a tracker of our own over one category label. */
export async function addCustomTracker(label: string, targetIls: number): Promise<TrackerResult> {
  const member = await sessionMember();
  if (!member) return fail(SESSION_EXPIRED_MESSAGE);
  const clean = cleanName(label ?? '');
  if (clean.length < 1 || clean.length > 80) return fail('צריך לבחור קטגוריה.');
  if (!validAmount(targetIls)) return fail('צריך יעד של אפס ומעלה.');
  return done(
    await upsert(
      { tracker_key: customKey(clean), category_label: clean, target_ils: targetIls, hidden: false, name: null },
      member,
    ),
  );
}

/** "עדכון צפי הכנסות משתנות" for one month; null goes back to RiseUp's. */
export async function setExpectedIncome(month: string, targetIls: number | null): Promise<TrackerResult> {
  const member = await sessionMember();
  if (!member) return fail(SESSION_EXPIRED_MESSAGE);
  if (!MONTH.test(month)) return fail('חודש לא תקין.');
  if (targetIls === null) return done(await drop(INCOME_KEY, month));
  if (!validAmount(targetIls)) return fail('צריך סכום של אפס ומעלה.');
  return done(await upsert({ tracker_key: INCOME_KEY, month, target_ils: targetIls }, member));
}

/**
 * "העברת כמה הכנסות יחד": several cash incomes to another month at once.
 * RiseUp's own incomes cannot move — its API is read-only — so only ours do.
 */
export async function moveCashIncomesToMonth(ids: string[], month: string): Promise<TrackerResult> {
  if (!(await sessionMember())) return fail(SESSION_EXPIRED_MESSAGE);
  if (!Array.isArray(ids) || ids.length === 0) return fail('לא נבחרו הכנסות.');
  if (ids.length > 100) return fail('יותר מדי הכנסות בבת אחת.');
  if (!MONTH.test(month)) return fail('חודש לא תקין.');
  for (const id of ids) {
    const result = await moveCashEntryToMonth(id, 'income', month);
    if (!result.ok) return fail(result.error);
  }
  return { ok: true };
}

export interface TrackableCategory {
  label: string;
  /** Spending with this label in the last months, for ordering. */
  spent: number;
}

export interface HiddenTracker {
  key: string;
  name: string;
}

/**
 * What "הוספת קטגוריה למעקב" offers: every category the household has —
 * labels on RiseUp's transactions and on our list — that is not tracked
 * yet, plus RiseUp trackers that were hidden here and can come back.
 */
export async function trackableCategories(
  month: string,
  trackedNames: string[],
): Promise<{ ok: true; data: { categories: TrackableCategory[]; hidden: HiddenTracker[] } } | { ok: false; error: string }> {
  if (!(await sessionMember())) return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  if (!MONTH.test(month)) return { ok: false, error: 'חודש לא תקין.' };
  const supabase = db();

  const [transactions, categories, trackers, overrides] = await Promise.all([
    supabase.from('riseup_transactions').select('category_label, amount_ils').eq('is_income', false).not('category_label', 'is', null),
    supabase.from('categories').select('label').eq('is_active', true),
    supabase.from('riseup_envelopes').select('envelope_id, name').eq('month', month).eq('envelope_type', 'trackingCategory'),
    supabase.from('tracker_overrides').select('*').eq('month', ''),
  ]);
  const failed = [transactions, categories, trackers].find((r) => r.error);
  if (failed?.error) {
    console.error('Trackable categories failed:', failed.error.message);
    return { ok: false, error: 'לא הצלחנו לטעון את הקטגוריות. נסו שוב.' };
  }

  const spent = new Map<string, number>();
  for (const row of (transactions.data ?? []) as { category_label: string; amount_ils: number | string }[]) {
    const label = cleanName(row.category_label);
    if (label) spent.set(label, (spent.get(label) ?? 0) + Math.abs(Number(row.amount_ils) || 0));
  }
  for (const row of (categories.data ?? []) as { label: string }[]) {
    const label = cleanName(row.label);
    if (label && !spent.has(label)) spent.set(label, 0);
  }

  const list = toOverrides(overrides.data as TrackerOverrideRow[] | null);
  const tracked = new Set(trackedNames.map(cleanName));
  const hidden: HiddenTracker[] = [];
  for (const row of (trackers.data ?? []) as { envelope_id: string; name: string | null }[]) {
    const key = trackerKey(row.envelope_id);
    const o = list.find((x) => x.trackerKey === key);
    if (row.name) tracked.add(cleanName(row.name));
    if (o?.hidden) hidden.push({ key, name: o.name ?? row.name ?? key });
  }

  const result = [...spent.entries()]
    .filter(([label]) => !tracked.has(label))
    .map(([label, total]) => ({ label, spent: Math.round(total) }))
    .sort((a, b) => b.spent - a.spent || a.label.localeCompare(b.label, 'he'));

  return { ok: true, data: { categories: result, hidden } };
}
