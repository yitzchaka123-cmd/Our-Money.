'use server';

import { SESSION_EXPIRED_MESSAGE, sessionMember } from '@/lib/auth/member';
import { db } from '@/lib/db/client';

/**
 * What the insight cards write: which ones a member dismissed, and whether
 * one helped. Each action checks the session itself.
 */

export type InsightResult = { ok: true } | { ok: false; error: string };

function validKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= 200;
}

async function writeFeedback(key: string, patch: { dismissed?: boolean; helpful?: boolean }): Promise<InsightResult> {
  const memberId = await sessionMember();
  if (!memberId) return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  if (!validKey(key)) return { ok: false, error: 'כרטיס לא מוכר.' };

  const { error } = await db()
    .from('insight_feedback')
    .upsert({ member_id: memberId, insight_key: key, ...patch, at: new Date().toISOString() }, { onConflict: 'member_id,insight_key' });
  if (error) {
    console.error('Saving insight feedback failed:', error.message);
    return { ok: false, error: 'משהו השתבש בשמירה. נסו שוב בעוד רגע.' };
  }
  return { ok: true };
}

/** X on a card: it does not come back for the same key. */
export async function dismissInsight(key: string): Promise<InsightResult> {
  return writeFeedback(key, { dismissed: true });
}

/** "ביטול" on the snackbar. */
export async function restoreInsight(key: string): Promise<InsightResult> {
  return writeFeedback(key, { dismissed: false });
}

/** "זה עזר לך?" — yes or no. */
export async function rateInsight(key: string, helpful: boolean): Promise<InsightResult> {
  if (typeof helpful !== 'boolean') return { ok: false, error: 'תשובה לא תקינה.' };
  return writeFeedback(key, { helpful });
}
