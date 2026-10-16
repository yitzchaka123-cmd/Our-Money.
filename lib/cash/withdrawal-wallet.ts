import { db } from '@/lib/db/client';

/**
 * "Which wallet did this cash go into?" — for one ATM withdrawal, whether the
 * bank reported it (via RiseUp) or someone typed it in.
 *
 * Not a server action: it trusts its caller. The web goes through
 * `assignWithdrawalToWallet` in lib/cash/wallet-actions.ts, which checks the
 * session first; the Telegram bot calls this directly once it has checked
 * that the button was pressed by a household member.
 */

export type AssignWithdrawalResult = { ok: true; id: string; walletName: string } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function assignWithdrawal(topupId: string, walletId: string): Promise<AssignWithdrawalResult> {
  if (!UUID.test(topupId)) return { ok: false, error: 'המשיכה לא נמצאה.' };
  if (!UUID.test(walletId)) return { ok: false, error: 'הארנק לא נמצא.' };

  const supabase = db();
  const [{ data: topup }, { data: wallet }] = await Promise.all([
    supabase.from('cash_topups').select('id, source, is_dismissed').eq('id', topupId).maybeSingle(),
    supabase.from('cash_wallets').select('id, name').eq('id', walletId).eq('is_archived', false).maybeSingle(),
  ]);
  const isWithdrawal = topup && !topup.is_dismissed && (topup.source === 'riseup_withdrawal' || topup.source === 'manual');
  if (!isWithdrawal) return { ok: false, error: 'המשיכה לא נמצאה.' };
  if (!wallet) return { ok: false, error: 'הארנק לא נמצא.' };

  const { error } = await supabase
    .from('cash_topups')
    .update({ wallet_id: walletId, updated_at: new Date().toISOString() })
    .eq('id', topupId);
  if (error) {
    console.error('Assigning a withdrawal to a wallet failed:', error.message);
    return { ok: false, error: 'משהו השתבש בשמירה. נסו שוב בעוד רגע.' };
  }
  return { ok: true, id: topupId, walletName: wallet.name as string };
}
