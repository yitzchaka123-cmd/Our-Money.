'use server';

import { revalidatePath } from 'next/cache';

import { SESSION_EXPIRED_MESSAGE, sessionMember } from '@/lib/auth/member';
import { db } from '@/lib/db/client';

/**
 * The name the app calls you by, instead of your Telegram account's name.
 * Only the signed-in member's own name; an empty name goes back to none, and
 * the app then says just "היי".
 *
 * Minimal version written for the settings page (item 25). Item 8 owns the
 * greeting; when both land, keep one copy of this action.
 */
export async function setPreferredName(name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const memberId = await sessionMember();
  if (!memberId) return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length > 40) return { ok: false, error: 'שם קצר יותר, בבקשה — עד 40 תווים.' };

  const { error } = await db()
    .from('household_members')
    .update({ preferred_name: clean || null })
    .eq('id', memberId);
  if (error) {
    console.error('Preferred name failed:', error.message);
    return { ok: false, error: 'משהו השתבש בשמירה. נסו שוב בעוד רגע.' };
  }
  revalidatePath('/dashboard');
  revalidatePath('/settings');
  return { ok: true };
}
