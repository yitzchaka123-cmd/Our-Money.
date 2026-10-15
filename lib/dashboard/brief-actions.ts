'use server';

import { revalidatePath } from 'next/cache';

import { SESSION_EXPIRED_MESSAGE, sessionMember } from '@/lib/auth/member';
import { db } from '@/lib/db/client';

/**
 * What the daily brief writes: how far a member has read. The action checks
 * the session itself — a server action is an HTTP endpoint.
 */

export type BriefResult = { ok: true } | { ok: false; error: string };

const SAVE_FAILED = 'משהו השתבש בשמירה. נסו שוב בעוד רגע.';

function failed(what: string, error: { message: string }): BriefResult {
  console.error(`${what} failed:`, error.message);
  return { ok: false, error: SAVE_FAILED };
}

/**
 * The member reached the last card: everything up to `asOf` — the moment the
 * brief was built — is read. Never moves backwards, and never past now, so a
 * stale tab cannot hide news that arrived after it was opened.
 */
export async function finishBrief(asOf: string): Promise<BriefResult> {
  const memberId = await sessionMember();
  if (!memberId) return { ok: false, error: SESSION_EXPIRED_MESSAGE };

  const at = Date.parse(asOf);
  if (!Number.isFinite(at)) return { ok: false, error: 'זמן לא תקין.' };
  const seenUntil = new Date(Math.min(at, Date.now())).toISOString();

  const supabase = db();
  const { data: current, error: readError } = await supabase
    .from('member_brief_state')
    .select('seen_until')
    .eq('member_id', memberId)
    .maybeSingle();
  if (readError) return failed('Reading brief state', readError);
  if (current && Date.parse(current.seen_until as string) >= Date.parse(seenUntil)) return { ok: true };

  const { error } = await supabase
    .from('member_brief_state')
    .upsert({ member_id: memberId, seen_until: seenUntil, updated_at: new Date().toISOString() }, { onConflict: 'member_id' });
  if (error) return failed('Finishing the brief', error);

  revalidatePath('/dashboard');
  return { ok: true };
}

/**
 * Settings → "הסיכום היומי": turn the daily brief (the blob, the deck and the
 * drawer's link) on or off for this member. Stored on their own row
 * (migration 0012); on by default.
 */
export async function setBriefEnabled(enabled: boolean): Promise<BriefResult> {
  const memberId = await sessionMember();
  if (!memberId) return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  if (typeof enabled !== 'boolean') return { ok: false, error: 'ערך לא תקין.' };

  const { error } = await db().from('household_members').update({ show_daily_brief: enabled }).eq('id', memberId);
  if (error) return failed('Saving the brief setting', error);

  revalidatePath('/dashboard');
  revalidatePath('/settings');
  return { ok: true };
}
