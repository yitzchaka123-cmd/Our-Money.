'use server';

import { revalidatePath } from 'next/cache';

import { sessionMember, SESSION_EXPIRED_MESSAGE } from '@/lib/auth/member';
import { NOTE_MAX } from '@/lib/dashboard/notes';
import { db } from '@/lib/db/client';

/**
 * "להוסיף הערה" on a RiseUp charge (feedback video 2, item 16). RiseUp's API
 * is read-only, so the note is ours: kept in money.transaction_notes and laid
 * over the charge wherever it shows. An empty note removes it.
 */
export async function saveTransactionNote(
  transactionId: string,
  month: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const memberId = await sessionMember();
  if (!memberId) return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  if (typeof transactionId !== 'string' || transactionId.length < 1 || transactionId.length > 200) {
    return { ok: false, error: 'העסקה לא נמצאה.' };
  }
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: 'חודש לא תקין.' };
  const value = typeof note === 'string' ? note.trim() : '';
  if (value.length > NOTE_MAX) return { ok: false, error: `הערה עד ${NOTE_MAX} תווים.` };

  const notes = db().from('transaction_notes');
  const { error } = value
    ? await notes.upsert(
        { transaction_id: transactionId, month, note: value, updated_by: memberId, updated_at: new Date().toISOString() },
        { onConflict: 'transaction_id' },
      )
    : await notes.delete().eq('transaction_id', transactionId);
  if (error) {
    console.error('Saving a note failed:', error.message);
    return { ok: false, error: 'משהו השתבש בשמירה. נסו שוב בעוד רגע.' };
  }
  revalidatePath('/dashboard');
  return { ok: true };
}
