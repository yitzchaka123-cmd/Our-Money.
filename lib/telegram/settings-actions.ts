'use server';

import { revalidatePath } from 'next/cache';

import { SESSION_EXPIRED_MESSAGE, sessionMember } from '@/lib/auth/member';
import { db } from '@/lib/db/client';
import { isConfirmMode, isNudgeFrequency, type ConfirmMode, type NudgeFrequency } from '@/lib/telegram/settings';

/**
 * Settings → טלגרם. Either partner may set either person's bot settings —
 * it is one household, and often only one of them opens the app.
 */

export type TelegramSettingResult = { ok: true } | { ok: false; error: string };

const SAVE_FAILED = 'לא הצלחנו לשמור. נסו שוב בעוד רגע.';

async function updateMember(memberId: string, patch: Record<string, string>): Promise<TelegramSettingResult> {
  if (!(await sessionMember())) return { ok: false, error: SESSION_EXPIRED_MESSAGE };

  const { data, error } = await db()
    .from('household_members')
    .update(patch)
    .eq('id', memberId)
    .eq('is_active', true)
    .select('id');
  if (error) {
    console.error('Saving a Telegram setting failed:', error.message);
    return { ok: false, error: SAVE_FAILED };
  }
  if (!data || data.length === 0) return { ok: false, error: 'החבר הזה כבר לא מחובר.' };

  revalidatePath('/settings');
  return { ok: true };
}

/** How often the evening "היו היום הוצאות במזומן?" comes to this member. */
export async function setNudgeFrequency(memberId: string, frequency: NudgeFrequency): Promise<TelegramSettingResult> {
  if (!isNudgeFrequency(frequency)) return { ok: false, error: 'בחירה לא מוכרת.' };
  return updateMember(String(memberId), { nudge_frequency: frequency });
}

/** Save a spend from the bot at once, or wait for "לאשר". */
export async function setConfirmMode(memberId: string, mode: ConfirmMode): Promise<TelegramSettingResult> {
  if (!isConfirmMode(mode)) return { ok: false, error: 'בחירה לא מוכרת.' };
  return updateMember(String(memberId), { bot_confirm_mode: mode });
}
