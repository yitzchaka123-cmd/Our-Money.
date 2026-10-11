'use server';

import { revalidatePath } from 'next/cache';

import { SESSION_EXPIRED_MESSAGE, sessionMember } from '@/lib/auth/member';
import { db } from '@/lib/db/client';

/**
 * Name a card or bank account once ("כרטיס 0848"). RiseUp is read-only and
 * never sends the real number, so the name is ours, kept in
 * money.account_labels and shown everywhere the account appears. An empty
 * name removes ours and the provider's name shows again.
 */
export async function setAccountLabel(
  source: string,
  accountNumberHash: string,
  label: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await sessionMember())) return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  if (!source.trim() || !accountNumberHash.trim()) return { ok: false, error: 'החשבון לא מזוהה.' };
  const name = label.trim().replace(/\s+/g, ' ');
  if (name.length > 40) return { ok: false, error: 'שם קצר יותר, בבקשה — עד 40 תווים.' };

  const supabase = db();
  const { error } = name
    ? await supabase
        .from('account_labels')
        .upsert(
          { source, account_number_hash: accountNumberHash, label: name, updated_at: new Date().toISOString() },
          { onConflict: 'source,account_number_hash' },
        )
    : await supabase.from('account_labels').delete().eq('source', source).eq('account_number_hash', accountNumberHash);
  if (error) {
    console.error('Account label failed:', error.message);
    return { ok: false, error: 'משהו השתבש בשמירה. נסו שוב בעוד רגע.' };
  }
  revalidatePath('/dashboard');
  revalidatePath('/accounts');
  revalidatePath('/settings');
  return { ok: true };
}
