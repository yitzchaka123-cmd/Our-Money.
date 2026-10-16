import { db } from '@/lib/db/client';

/**
 * Put a withdrawal (cash from the bank) into a chosen wallet — the answer to
 * the bot's "לאיזה ארנק נכנס הכסף?" (feedback video 2 #6).
 *
 * No session: the caller (the bot) must already have checked that the
 * Telegram user is a household member. Minimal version with the same path and
 * signature as the wallets helper's, so the two overlap cleanly on merge.
 */

export type AssignResult = { ok: true; id: string; walletName: string } | { ok: false; error: string };

export async function assignWithdrawal(topupId: string, walletId: string): Promise<AssignResult> {
  const supabase = db();

  const { data: wallet, error: walletError } = await supabase
    .from('cash_wallets')
    .select('id, name')
    .eq('id', walletId)
    .eq('is_archived', false)
    .maybeSingle();
  if (walletError) return { ok: false, error: 'משהו השתבש. נסו שוב בעוד רגע.' };
  if (!wallet) return { ok: false, error: 'הארנק לא נמצא.' };

  const { data, error } = await supabase
    .from('cash_topups')
    .update({ wallet_id: walletId, updated_at: new Date().toISOString() })
    .eq('id', topupId)
    .in('source', ['riseup_withdrawal', 'manual'])
    .eq('is_dismissed', false)
    .select('id');
  if (error) {
    console.error('Moving a withdrawal to a wallet failed:', error.message);
    return { ok: false, error: 'משהו השתבש. נסו שוב בעוד רגע.' };
  }
  if (!data || data.length === 0) return { ok: false, error: 'המשיכה כבר לא קיימת.' };
  return { ok: true, id: topupId, walletName: wallet.name as string };
}
