import { db } from '@/lib/db/client';
import { listWallets } from '@/lib/db/queries';
import { formatIls } from '@/lib/money';
import { escapeHtml, sendMessage } from '@/lib/telegram/client';
import { encodeCallback, walletTag } from '@/lib/telegram/format';
import { familyGroupChatId } from '@/lib/telegram/group';
import type { InlineKeyboard } from '@/lib/telegram/types';
import type { CashTopup, CashWallet } from '@/lib/types';

/**
 * "זיהינו משיכה של X מהכספומט. לאיזה ארנק נכנס הכסף?" (feedback video 2 #6b).
 *
 * After every sync, each bank withdrawal that was never asked about gets one
 * message — in the family group if there is one, otherwise to each member —
 * with a button per wallet. cash_topups.wallet_asked_at (migration 0010) is
 * claimed before sending, so two syncs running at once never ask twice. If
 * nobody could be reached, the claim is released and the next sync tries
 * again, for up to two days; older withdrawals are never asked about.
 */

const ASK_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

function shortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${Number(day)}.${Number(month)}`;
}

export function withdrawalQuestion(topup: Pick<CashTopup, 'id' | 'amount_ils' | 'occurred_at'>, wallets: CashWallet[]): {
  text: string;
  keyboard: InlineKeyboard;
} {
  const amount = `<b>${formatIls(Number(topup.amount_ils))}</b>`;
  const when = shortDate(topup.occurred_at);
  const notWithdrawal = [{ text: '↩️ זו לא משיכה', callback_data: encodeCallback({ kind: 'dismiss_topup', spendId: topup.id }) }];

  // One wallet: nothing to choose — just say where it went.
  if (wallets.length <= 1) {
    const name = wallets[0]?.name ?? 'הארנק';
    return {
      text: `🏧 זיהינו משיכה של ${amount} מהכספומט ב-${when}. הכסף נכנס ל${escapeHtml(name)}.`,
      keyboard: [notWithdrawal],
    };
  }

  return {
    text: `🏧 זיהינו משיכה של ${amount} מהכספומט ב-${when}. לאיזה ארנק נכנס הכסף?`,
    keyboard: [
      ...wallets.map((w, index) => [
        {
          text: `👛 ${w.name}`,
          callback_data: encodeCallback({ kind: 'assign_wallet', spendId: topup.id, walletIndex: index, walletTag: walletTag(w.id) }),
        },
      ]),
      notWithdrawal,
    ],
  };
}

/** Ask about every recent, never-asked bank withdrawal. Returns how many were asked. */
export async function askWhichWallet(now = new Date()): Promise<number> {
  const supabase = db();
  const since = new Date(now.getTime() - ASK_WINDOW_MS).toISOString();
  const { data: pending, error } = await supabase
    .from('cash_topups')
    .select('*')
    .eq('source', 'riseup_withdrawal')
    .eq('is_dismissed', false)
    .is('wallet_asked_at', null)
    .gte('created_at', since)
    .order('occurred_at');
  // Before migration 0010 the column is missing: simply ask nothing.
  if (error || !pending || pending.length === 0) return 0;

  const [wallets, group, { data: members }] = await Promise.all([
    listWallets(),
    familyGroupChatId(),
    supabase.from('household_members').select('telegram_user_id').eq('is_active', true),
  ]);
  const targets = group !== null ? [group] : (members ?? []).map((m) => Number(m.telegram_user_id)).filter((id) => id > 0);
  if (targets.length === 0) return 0;

  let asked = 0;
  for (const topup of pending as CashTopup[]) {
    // Claim it first: whoever sets the stamp is the one who asks.
    const { data: claimed } = await supabase
      .from('cash_topups')
      .update({ wallet_asked_at: now.toISOString() })
      .eq('id', topup.id)
      .is('wallet_asked_at', null)
      .select('id');
    if (!claimed || claimed.length === 0) continue;

    const { text, keyboard } = withdrawalQuestion(topup, wallets);
    let delivered = 0;
    for (const chatId of targets) {
      try {
        await sendMessage(chatId, text, keyboard);
        delivered += 1;
      } catch (sendError) {
        // A member who never opened a chat with the bot cannot be messaged.
        console.error('Withdrawal question not delivered', sendError);
      }
    }
    if (delivered === 0) {
      await supabase.from('cash_topups').update({ wallet_asked_at: null }).eq('id', topup.id);
    } else {
      asked += 1;
    }
  }
  return asked;
}
