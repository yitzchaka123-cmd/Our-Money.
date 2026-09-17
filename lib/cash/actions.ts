'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { resolveEnvelopeForCategory, type EnvelopeRef } from '@/lib/cash/envelopes';
import { db } from '@/lib/db/client';
import { syncRiseup } from '@/lib/riseup/sync';
import type { EnvelopeType } from '@/lib/types';

/**
 * Mutations for cash entries made from the web dashboard. Every action
 * re-checks the session cookie itself: a server action is an HTTP endpoint,
 * whatever the page around it did.
 */

export interface CashEntryInput {
  kind: 'spend' | 'income';
  amountIls: number;
  category: string;
  note: string | null;
  date: string;
  /** For spends: the envelope to file it in. Null resolves from the category. */
  envelopeId: string | null;
  memberId: string | null;
}

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

async function requireMember(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;
  if (!session) throw new Error('not signed in');
  return session.memberId;
}

function validate(input: CashEntryInput): string | null {
  if (!Number.isFinite(input.amountIls) || input.amountIls <= 0) return 'צריך סכום גדול מאפס.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return 'תאריך לא תקין.';
  if (!input.category.trim()) return 'צריך קטגוריה.';
  return null;
}

/** The month's envelopes, shaped for resolution — read at write time so a pin is always current. */
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
  input: CashEntryInput,
): Promise<{ envelope_id: string | null; envelope_type: string | null }> {
  const refs = await envelopeRefs(input.date.slice(0, 7));
  const pinned = input.envelopeId ? refs.find((r) => r.envelopeId === input.envelopeId) : null;
  const target = pinned ?? resolveEnvelopeForCategory(refs, input.category);
  return { envelope_id: target?.envelopeId ?? null, envelope_type: target?.type ?? null };
}

export async function addCashEntry(input: CashEntryInput): Promise<ActionResult> {
  const sessionMember = await requireMember();
  const problem = validate(input);
  if (problem) return { ok: false, error: problem };

  const memberId = input.memberId ?? sessionMember;
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
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath('/dashboard');
    return { ok: true, id: data.id as string };
  }

  const pin = await resolvePin(input);
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
      ...pin,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath('/dashboard');
  return { ok: true, id: data.id as string };
}

export async function updateCashEntry(id: string, input: CashEntryInput): Promise<ActionResult> {
  await requireMember();
  const problem = validate(input);
  if (problem) return { ok: false, error: problem };

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
        updated_at: now,
      })
      .eq('id', id)
      .eq('source', 'cash_income');
    if (error) return { ok: false, error: error.message };
  } else {
    const pin = await resolvePin(input);
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
        ...pin,
        updated_at: now,
      })
      .eq('id', id);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath('/dashboard');
  return { ok: true, id };
}

export async function deleteCashEntry(id: string, kind: 'spend' | 'income'): Promise<ActionResult> {
  await requireMember();
  const supabase = db();

  // Soft on both sides: a spend is marked deleted, an income is dismissed —
  // so nothing is lost and the wallet arithmetic simply stops counting it.
  const { error } =
    kind === 'income'
      ? await supabase.from('cash_topups').update({ is_dismissed: true }).eq('id', id)
      : await supabase
          .from('cash_spends')
          .update({ status: 'deleted', updated_at: new Date().toISOString() })
          .eq('id', id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/dashboard');
  return { ok: true, id };
}

/** The "refresh from RiseUp" button. */
export async function refreshFromRiseup(): Promise<{ ok: boolean; error: string | null }> {
  await requireMember();
  const result = await syncRiseup();
  revalidatePath('/dashboard');
  return { ok: !result.error, error: result.error };
}
