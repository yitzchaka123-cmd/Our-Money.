'use server';

import { revalidatePath } from 'next/cache';

import { SESSION_EXPIRED_MESSAGE, sessionMember } from '@/lib/auth/member';
import { db } from '@/lib/db/client';
import { normalizePreferredName } from '@/lib/profile/names';

export type ProfileResult = { ok: true; name: string | null } | { ok: false; error: string };

/**
 * "איך לקרוא לך?" — the signed-in member's own name for the greeting.
 * An empty name clears it (the card then says just "היי"). Used by the
 * setup checklist and by the settings page.
 */
export async function setPreferredName(input: string): Promise<ProfileResult> {
  const memberId = await sessionMember();
  if (!memberId) return { ok: false, error: SESSION_EXPIRED_MESSAGE };

  const checked = normalizePreferredName(String(input ?? ''));
  if (!checked.ok) return checked;

  const { error } = await db()
    .from('household_members')
    .update({ preferred_name: checked.value })
    .eq('id', memberId);
  if (error) {
    console.error('Saving the preferred name failed:', error.message);
    return { ok: false, error: 'לא הצלחנו לשמור את השם. נסו שוב.' };
  }

  revalidatePath('/dashboard');
  revalidatePath('/settings');
  return { ok: true, name: checked.value };
}
