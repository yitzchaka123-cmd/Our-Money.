'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { resolveEnvelopeForCategory, type EnvelopeRef } from '@/lib/cash/envelopes';
import { db } from '@/lib/db/client';
import { syncRiseup } from '@/lib/riseup/sync';
import type { EnvelopeType } from '@/lib/types';

/**
 * Mutations for cash made from the web dashboard. Every action re-checks the
 * session cookie itself: a server action is an HTTP endpoint, whatever the
 * page around it did.
 *
 * The set of actions mirrors RiseUp's own transaction sheet — note, move,
 * split, move to another month, mark as savings — plus edit and delete, which
 * RiseUp does not offer but which are ours to offer because the rows are ours.
 */

export type CashKind = 'spend' | 'income';

export interface CashEntryInput {
  kind: CashKind;
  amountIls: number;
  category: string;
  note: string | null;
  date: string;
  /** For spends: the envelope to file it in. Null resolves from the category. */
  envelopeId: string | null;
  memberId: string | null;
  walletId: string | null;
}

export interface SplitPart {
  amountIls: number;
  category: string;
  envelopeId: string | null;
  note: string | null;
}

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

const DASHBOARD = '/dashboard';

async function requireMember(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;
  if (!session) throw new Error('not signed in');
  return session.memberId;
}

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function validate(input: CashEntryInput): string | null {
  if (!Number.isFinite(input.amountIls) || input.amountIls <= 0) return 'צריך סכום גדול מאפס.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return 'תאריך לא תקין.';
  if (!input.category.trim()) return 'צריך קטגוריה.';
  return null;
}

/** The month's envelopes, read at write time so a pin is always current. */
async function envelopeRefs(month: string): Promise<EnvelopeRef[]> {
  const { data, error } = await db()
    .from('riseup_envelopes')
    .select('envelope_id, envelope_type, name')
    .eq('month', month);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    envelopeId: row.envelope_id as string,
    type: row.envelope_type as EnvelopeType,
    name: (row.name as string | null) ?? '',
  }));
}

async function resolvePin(
  month: string,
  envelopeId: string | null,
  category: string,
): Promise<{ envelope_id: string | null; envelope_type: string | null }> {
  const refs = await envelopeRefs(month);
  const pinned = envelopeId ? refs.find((r) => r.envelopeId === envelopeId) : null;
  const target = pinned ?? resolveEnvelopeForCategory(refs, category);
  return { envelope_id: target?.envelopeId ?? null, envelope_type: target?.type ?? null };
}

async function walletOrDefault(walletId: string | null): Promise<string | null> {
  if (walletId) return walletId;
  const { data } = await db()
    .from('cash_wallets')
    .select('id, is_default')
    .eq('is_archived', false)
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export async function addCashEntry(input: CashEntryInput): Promise<ActionResult> {
  const sessionMember = await requireMember();
  const problem = validate(input);
  if (problem) return fail(problem);

  const memberId = input.memberId ?? sessionMember;
  const walletId = await walletOrDefault(input.walletId);
  const supabase = db();

  if (input.kind === 'income') {
    const { data, error } = await supabase
      .from('cash_topups')
      .insert({
        amount_ils: input.amountIls,
        occurred_at: input.date,
        source: 'cash_income',
        category: input.category.trim(),
        note: input.note?.trim() || null,
        member_id: memberId,
        input_kind: 'web',
        wallet_id: walletId,
      })
      .select('id')
      .single();
    if (error) return fail(error.message);
    revalidatePath(DASHBOARD);
    return { ok: true, id: data.id as string };
  }

  const pin = await resolvePin(input.date.slice(0, 7), input.envelopeId, input.category);
  const { data, error } = await supabase
    .from('cash_spends')
    .insert({
      member_id: memberId,
      amount_ils: input.amountIls,
      category: input.category.trim(),
      note: input.note?.trim() || null,
      spent_at: input.date,
      status: 'confirmed',
      confidence: 'high',
      input_kind: 'web',
      wallet_id: walletId,
      ...pin,
    })
    .select('id')
    .single();
  if (error) return fail(error.message);
  revalidatePath(DASHBOARD);
  return { ok: true, id: data.id as string };
}

export async function updateCashEntry(id: string, input: CashEntryInput): Promise<ActionResult> {
  await requireMember();
  const problem = validate(input);
  if (problem) return fail(problem);

  const supabase = db();
  const now = new Date().toISOString();

  if (input.kind === 'income') {
    const { error } = await supabase
      .from('cash_topups')
      .update({
        amount_ils: input.amountIls,
        occurred_at: input.date,
        category: input.category.trim(),
        note: input.note?.trim() || null,
        ...(input.memberId ? { member_id: input.memberId } : {}),
        ...(input.walletId ? { wallet_id: input.walletId } : {}),
        updated_at: now,
      })
      .eq('id', id)
      .eq('source', 'cash_income');
    if (error) return fail(error.message);
  } else {
    const pin = await resolvePin(input.date.slice(0, 7), input.envelopeId, input.category);
    const { error } = await supabase
      .from('cash_spends')
      .update({
        amount_ils: input.amountIls,
        category: input.category.trim(),
        note: input.note?.trim() || null,
        spent_at: input.date,
        status: 'confirmed',
        confidence: 'high',
        ...(input.memberId ? { member_id: input.memberId } : {}),
        ...(input.walletId ? { wallet_id: input.walletId } : {}),
        ...pin,
        updated_at: now,
      })
      .eq('id', id);
    if (error) return fail(error.message);
  }

  revalidatePath(DASHBOARD);
  return { ok: true, id };
}

export async function deleteCashEntry(id: string, kind: CashKind): Promise<ActionResult> {
  await requireMember();
  const supabase = db();
  // Soft on both sides, so nothing is lost and the arithmetic just stops counting it.
  const { error } =
    kind === 'income'
      ? await supabase.from('cash_topups').update({ is_dismissed: true }).eq('id', id)
      : await supabase
          .from('cash_spends')
          .update({ status: 'deleted', updated_at: new Date().toISOString() })
          .eq('id', id);
  if (error) return fail(error.message);
  revalidatePath(DASHBOARD);
  return { ok: true, id };
}

/** RiseUp's "להוסיף הערה". */
export async function updateCashNote(id: string, kind: CashKind, note: string): Promise<ActionResult> {
  await requireMember();
  const supabase = db();
  const value = note.trim() || null;
  const { error } =
    kind === 'income'
      ? await supabase.from('cash_topups').update({ note: value, updated_at: new Date().toISOString() }).eq('id', id)
      : await supabase.from('cash_spends').update({ note: value, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return fail(error.message);
  revalidatePath(DASHBOARD);
  return { ok: true, id };
}

/** RiseUp's "להזיז את ההוצאה": file the spend into a different envelope. */
export async function moveCashSpendToEnvelope(id: string, envelopeId: string): Promise<ActionResult> {
  await requireMember();
  const supabase = db();
  const { data: spend, error: loadError } = await supabase
    .from('cash_spends')
    .select('spent_at, category')
    .eq('id', id)
    .maybeSingle();
  if (loadError || !spend) return fail(loadError?.message ?? 'הרישום לא נמצא.');

  const refs = await envelopeRefs((spend.spent_at as string).slice(0, 7));
  const target = refs.find((r) => r.envelopeId === envelopeId);
  if (!target) return fail('המעטפה לא קיימת בחודש הזה.');

  const { error } = await supabase
    .from('cash_spends')
    .update({
      envelope_id: target.envelopeId,
      envelope_type: target.type,
      // A tracker IS the category; the big envelopes keep whatever label it had.
      ...(target.type === 'trackingCategory' ? { category: target.name } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return fail(error.message);
  revalidatePath(DASHBOARD);
  return { ok: true, id };
}

/** RiseUp's "זו הפקדה לחיסכון!": file the spend into the savings envelope. */
export async function markCashSpendAsSavings(id: string): Promise<ActionResult> {
  await requireMember();
  const supabase = db();
  const { data: spend } = await supabase.from('cash_spends').select('spent_at').eq('id', id).maybeSingle();
  if (!spend) return fail('הרישום לא נמצא.');
  const goal = (await envelopeRefs((spend.spent_at as string).slice(0, 7))).find((r) => r.type === 'riseupGoal');
  if (!goal) return fail('אין מעטפת חיסכון ברייזאפ החודש.');
  return moveCashSpendToEnvelope(id, goal.envelopeId);
}

/**
 * RiseUp's "לפצל את ההוצאה": the original keeps the first part, the rest
 * become new rows with the same date, wallet and member. Parts must add up to
 * the original amount, so a split can never create or lose money.
 */
export async function splitCashEntry(id: string, kind: CashKind, parts: SplitPart[]): Promise<ActionResult> {
  await requireMember();
  if (parts.length < 2) return fail('פיצול צריך לפחות שני חלקים.');
  if (parts.some((p) => !Number.isFinite(p.amountIls) || p.amountIls <= 0)) return fail('כל חלק צריך סכום גדול מאפס.');
  if (parts.some((p) => !p.category.trim())) return fail('כל חלק צריך קטגוריה.');

  const supabase = db();
  const table = kind === 'income' ? 'cash_topups' : 'cash_spends';
  const { data: original, error: loadError } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (loadError || !original) return fail(loadError?.message ?? 'הרישום לא נמצא.');

  const total = Math.round(parts.reduce((s, p) => s + p.amountIls, 0) * 100) / 100;
  if (Math.abs(total - Number(original.amount_ils)) > 0.005) {
    return fail(`החלקים מסתכמים ב-${total} במקום ${Number(original.amount_ils)}.`);
  }

  const [first, ...rest] = parts;
  const now = new Date().toISOString();

  if (kind === 'income') {
    const { error } = await supabase
      .from('cash_topups')
      .update({ amount_ils: first!.amountIls, category: first!.category.trim(), note: first!.note?.trim() || null, updated_at: now })
      .eq('id', id);
    if (error) return fail(error.message);
    const { error: insertError } = await supabase.from('cash_topups').insert(
      rest.map((p) => ({
        amount_ils: p.amountIls,
        occurred_at: original.occurred_at,
        source: 'cash_income',
        category: p.category.trim(),
        note: p.note?.trim() || null,
        member_id: original.member_id,
        input_kind: 'web',
        wallet_id: original.wallet_id,
      })),
    );
    if (insertError) return fail(insertError.message);
  } else {
    const month = (original.spent_at as string).slice(0, 7);
    const firstPin = await resolvePin(month, first!.envelopeId, first!.category);
    const { error } = await supabase
      .from('cash_spends')
      .update({ amount_ils: first!.amountIls, category: first!.category.trim(), note: first!.note?.trim() || null, ...firstPin, updated_at: now })
      .eq('id', id);
    if (error) return fail(error.message);
    const rows = await Promise.all(
      rest.map(async (p) => ({
        member_id: original.member_id,
        amount_ils: p.amountIls,
        category: p.category.trim(),
        note: p.note?.trim() || null,
        spent_at: original.spent_at,
        status: 'confirmed',
        confidence: 'high',
        input_kind: 'web',
        wallet_id: original.wallet_id,
        ...(await resolvePin(month, p.envelopeId, p.category)),
      })),
    );
    const { error: insertError } = await supabase.from('cash_spends').insert(rows);
    if (insertError) return fail(insertError.message);
  }

  revalidatePath(DASHBOARD);
  return { ok: true, id };
}

/**
 * RiseUp's "להזיז את העסקה לחודש אחר": same day of the month, in the target
 * month, clamped to that month's length. A spend's envelope pin is re-resolved
 * against the new month, since envelope ids are per plan.
 */
export async function moveCashEntryToMonth(id: string, kind: CashKind, month: string): Promise<ActionResult> {
  await requireMember();
  if (!/^\d{4}-\d{2}$/.test(month)) return fail('חודש לא תקין.');

  const supabase = db();
  const table = kind === 'income' ? 'cash_topups' : 'cash_spends';
  const dateColumn = kind === 'income' ? 'occurred_at' : 'spent_at';
  const { data: row, error: loadError } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (loadError || !row) return fail(loadError?.message ?? 'הרישום לא נמצא.');

  const day = Number((row[dateColumn] as string).slice(8, 10));
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const newDate = `${month}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;

  const patch: Record<string, unknown> = { [dateColumn]: newDate, updated_at: new Date().toISOString() };
  if (kind === 'spend') Object.assign(patch, await resolvePin(month, null, row.category as string));

  const { error } = await supabase.from(table).update(patch).eq('id', id);
  if (error) return fail(error.message);
  revalidatePath(DASHBOARD);
  return { ok: true, id };
}

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

export async function createWallet(name: string, memberId: string | null): Promise<ActionResult> {
  await requireMember();
  const trimmed = name.trim();
  if (!trimmed) return fail('צריך שם לארנק.');
  const supabase = db();
  const { count } = await supabase.from('cash_wallets').select('id', { count: 'exact', head: true });
  const { data, error } = await supabase
    .from('cash_wallets')
    .insert({ name: trimmed, member_id: memberId, is_default: (count ?? 0) === 0, position: count ?? 0 })
    .select('id')
    .single();
  if (error) return fail(error.message);
  revalidatePath(DASHBOARD);
  return { ok: true, id: data.id as string };
}

export async function renameWallet(id: string, name: string): Promise<ActionResult> {
  await requireMember();
  if (!name.trim()) return fail('צריך שם לארנק.');
  const { error } = await db().from('cash_wallets').update({ name: name.trim() }).eq('id', id);
  if (error) return fail(error.message);
  revalidatePath(DASHBOARD);
  return { ok: true, id };
}

/** Archive rather than delete: its history stays and its balance stays counted in the total. */
export async function archiveWallet(id: string): Promise<ActionResult> {
  await requireMember();
  const supabase = db();
  const { data } = await supabase.from('cash_wallets').select('is_default').eq('id', id).maybeSingle();
  if (data?.is_default) return fail('אי אפשר לארכב את ארנק ברירת המחדל — קודם בחרו ארנק אחר כברירת מחדל.');
  const { error } = await supabase.from('cash_wallets').update({ is_archived: true }).eq('id', id);
  if (error) return fail(error.message);
  revalidatePath(DASHBOARD);
  return { ok: true, id };
}

export async function setDefaultWallet(id: string): Promise<ActionResult> {
  await requireMember();
  const supabase = db();
  // The unique partial index allows one default; clear first, then set.
  const { error: clearError } = await supabase.from('cash_wallets').update({ is_default: false }).eq('is_default', true);
  if (clearError) return fail(clearError.message);
  const { error } = await supabase.from('cash_wallets').update({ is_default: true }).eq('id', id);
  if (error) return fail(error.message);
  revalidatePath(DASHBOARD);
  return { ok: true, id };
}

export interface TransferInput {
  fromWalletId: string;
  toWalletId: string;
  amountIls: number;
  date: string;
  note: string | null;
}

export async function transferBetweenWallets(input: TransferInput): Promise<ActionResult> {
  const memberId = await requireMember();
  if (input.fromWalletId === input.toWalletId) return fail('צריך שני ארנקים שונים.');
  if (!Number.isFinite(input.amountIls) || input.amountIls <= 0) return fail('צריך סכום גדול מאפס.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return fail('תאריך לא תקין.');
  const { data, error } = await db()
    .from('cash_transfers')
    .insert({
      from_wallet_id: input.fromWalletId,
      to_wallet_id: input.toWalletId,
      amount_ils: input.amountIls,
      occurred_at: input.date,
      note: input.note?.trim() || null,
      member_id: memberId,
    })
    .select('id')
    .single();
  if (error) return fail(error.message);
  revalidatePath(DASHBOARD);
  return { ok: true, id: data.id as string };
}

export async function deleteTransfer(id: string): Promise<ActionResult> {
  await requireMember();
  const { error } = await db().from('cash_transfers').update({ is_dismissed: true }).eq('id', id);
  if (error) return fail(error.message);
  revalidatePath(DASHBOARD);
  return { ok: true, id };
}

// ---------------------------------------------------------------------------

/** The "refresh from RiseUp" button. */
export async function refreshFromRiseup(): Promise<{ ok: boolean; error: string | null; envelopes: number }> {
  await requireMember();
  const result = await syncRiseup();
  revalidatePath(DASHBOARD);
  return { ok: !result.error, error: result.error, envelopes: result.envelopesUpserted };
}
