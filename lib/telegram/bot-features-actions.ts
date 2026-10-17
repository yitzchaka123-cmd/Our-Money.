'use server';

import { revalidatePath } from 'next/cache';

import { SESSION_EXPIRED_MESSAGE, sessionMember } from '@/lib/auth/member';
import { db } from '@/lib/db/client';
import { isBotFeature, type BotFeature } from '@/lib/telegram/bot-features';

/** Settings → טלגרם: turn a household-wide bot switch on or off (either partner may). */
export async function setBotFeature(
  feature: BotFeature,
  on: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const memberId = await sessionMember();
  if (!memberId) return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  if (!isBotFeature(feature) || typeof on !== 'boolean') return { ok: false, error: 'בחירה לא מוכרת.' };

  const { error } = await db()
    .from('app_settings')
    .upsert(
      { key: feature, value: on ? 'on' : 'off', updated_by: memberId, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
  if (error) {
    console.error('Saving a bot switch failed:', error.message);
    return { ok: false, error: 'לא הצלחנו לשמור. נסו שוב בעוד רגע.' };
  }
  revalidatePath('/settings');
  return { ok: true };
}
