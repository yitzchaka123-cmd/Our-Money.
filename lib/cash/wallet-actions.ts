'use server';

import { revalidatePath } from 'next/cache';

import { SESSION_EXPIRED_MESSAGE, sessionMember } from '@/lib/auth/member';
import { applyIncomeKind } from '@/lib/cash/income-kind-store';
import { isIncomeKind, type IncomeKind } from '@/lib/cash/income-kinds';
import { assignWithdrawal } from '@/lib/cash/withdrawal-wallet';
import { db } from '@/lib/db/client';
import { isoDateInIsrael } from '@/lib/dates';
import { walletBalances } from '@/lib/reconcile';
import type { CashSpend, CashTopup, CashTransfer, CashWallet } from '@/lib/types';

/**
 * A wallet's own settings screen: set how much is in it now, add money to it,
 * and remove it once it is empty. Rename and "make default" live with the
 * other wallet actions in lib/cash/actions.ts.
 *
 * Nothing here rewrites history. Setting the amount stores the difference as
 * an 'adjustment' row (signed), and removing a wallet that ever held money
 * archives it rather than deleting its rows.
 */

export type WalletActionResult = { ok: true; id: string } | { ok: false; error: string };
export type DeleteWalletResult = { ok: true; id: string; outcome: 'deleted' | 'archived' } | { ok: false; error: string };

/** Where money added to a wallet came from. Only a withdrawal or income touches the cashflow. */
export type MoneySource = 'withdrawal' | 'income' | 'other';

export interface AddMoneyInput {
  walletId: string;
  amountIls: number;
  from: MoneySource;
  note: string | null;
  date: string;
  /** Income only: "איזו הכנסה זו?" — its kind and category. */
  incomeKind?: IncomeKind | null;
  category?: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function refreshPages(): void {
  revalidatePath('/dashboard');
  revalidatePath('/daily');
  revalidatePath('/accounts');
}

function dbFail(error: { message: string }): { ok: false; error: string } {
  console.error('Wallet action failed:', error.message);
  return { ok: false, error: 'משהו השתבש בשמירה. נסו שוב בעוד רגע.' };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Every live wallet's balance, computed exactly as the dashboard computes it. */
async function currentBalances(): Promise<{ wallets: CashWallet[]; balanceOf: (id: string) => number | null }> {
  const supabase = db();
  const [{ data: wallets }, { data: topups }, { data: spends }, { data: transfers }] = await Promise.all([
    supabase.from('cash_wallets').select('*').eq('is_archived', false).order('position').order('created_at'),
    supabase.from('cash_topups').select('*').eq('is_dismissed', false),
    supabase.from('cash_spends').select('*').neq('status', 'deleted'),
    supabase.from('cash_transfers').select('*').eq('is_dismissed', false),
  ]);
  const list = (wallets ?? []) as CashWallet[];
  const balances = walletBalances(
    list,
    (topups ?? []) as CashTopup[],
    (spends ?? []) as CashSpend[],
    (transfers ?? []) as CashTransfer[],
  );
  return {
    wallets: list,
    balanceOf: (id) => balances.find((b) => b.walletId === id)?.balance ?? null,
  };
}

/**
 * "There is really X in this wallet now." The difference from what the ledger
 * says is stored as one adjustment row dated `date` (today by default), so
 * every past entry stays as it was and dismissing the row undoes it.
 */
export async function setWalletBalance(walletId: string, amountIls: number, date?: string): Promise<WalletActionResult> {
  const memberId = await sessionMember();
  if (!memberId) return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  if (!Number.isFinite(amountIls) || amountIls < 0) return { ok: false, error: 'צריך סכום של אפס או יותר.' };
  const day = date ?? isoDateInIsrael();
  if (!ISO_DATE.test(day)) return { ok: false, error: 'תאריך לא תקין.' };

  const { balanceOf } = await currentBalances();
  const current = balanceOf(walletId);
  if (current === null) return { ok: false, error: 'הארנק לא נמצא.' };

  const difference = round(amountIls - current);
  if (Math.abs(difference) < 0.005) return { ok: true, id: walletId };

  const { data, error } = await db()
    .from('cash_topups')
    .insert({
      amount_ils: difference,
      occurred_at: day,
      source: 'adjustment',
      note: 'עדכון יתרה',
      member_id: memberId,
      input_kind: 'web',
      wallet_id: walletId,
    })
    .select('id')
    .single();
  if (error) return dbFail(error);
  refreshPages();
  return { ok: true, id: data.id as string };
}

/**
 * Money into one wallet. A withdrawal is cash from the bank (the next sync
 * links it to the bank line); income counts in the month's cash income; and
 * "other" just puts money in the wallet without touching the cashflow.
 */
export async function addMoneyToWallet(input: AddMoneyInput): Promise<WalletActionResult> {
  const memberId = await sessionMember();
  if (!memberId) return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  if (!Number.isFinite(input.amountIls) || input.amountIls <= 0) return { ok: false, error: 'צריך סכום גדול מאפס.' };
  if (!ISO_DATE.test(input.date)) return { ok: false, error: 'תאריך לא תקין.' };

  const supabase = db();
  const { data: wallet } = await supabase
    .from('cash_wallets')
    .select('id')
    .eq('id', input.walletId)
    .eq('is_archived', false)
    .maybeSingle();
  if (!wallet) return { ok: false, error: 'הארנק לא נמצא.' };

  const note = input.note?.trim() || null;
  const incomeKind = input.from === 'income' && isIncomeKind(input.incomeKind) ? input.incomeKind : null;
  const row =
    input.from === 'withdrawal'
      ? { source: 'manual', category: 'משיכה', note }
      : input.from === 'income'
        ? {
            source: 'cash_income',
            category: input.category?.trim() || note || 'הכנסה במזומן',
            note,
            ...(incomeKind ? { income_kind: incomeKind } : {}),
          }
        : { source: 'adjustment', category: null, note: note ?? 'הוספת כסף לארנק' };

  const { data, error } = await supabase
    .from('cash_topups')
    .insert({
      ...row,
      amount_ils: round(input.amountIls),
      occurred_at: input.date,
      member_id: memberId,
      input_kind: 'web',
      wallet_id: input.walletId,
    })
    .select('id')
    .single();
  if (error) return dbFail(error);
  if (incomeKind) await applyIncomeKind(data.id as string, null);
  refreshPages();
  return { ok: true, id: data.id as string };
}

/**
 * "עדכון כמה צפוי להיכנס": the couple's own figure for how much cash comes
 * into the wallets this month, in place of the app's guess. Null goes back to
 * the guess. Kept on our side only.
 */
export async function setCashInflowOverride(month: string, amountIls: number | null): Promise<WalletActionResult> {
  const memberId = await sessionMember();
  if (!memberId) return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: 'חודש לא תקין.' };

  const supabase = db();
  if (amountIls === null) {
    const { error } = await supabase.from('cash_inflow_overrides').delete().eq('month', month);
    if (error) return dbFail(error);
  } else {
    if (!Number.isFinite(amountIls) || amountIls < 0) return { ok: false, error: 'צריך סכום של אפס או יותר.' };
    const { error } = await supabase
      .from('cash_inflow_overrides')
      .upsert({ month, amount_ils: round(amountIls), member_id: memberId, updated_at: new Date().toISOString() }, { onConflict: 'month' });
    if (error) return dbFail(error);
  }
  refreshPages();
  return { ok: true, id: month };
}

/**
 * File an ATM withdrawal into a wallet, from the web. The bot uses
 * `assignWithdrawal` (lib/cash/withdrawal-wallet.ts) directly, since it has no
 * session cookie and checks the Telegram user itself.
 */
export async function assignWithdrawalToWallet(topupId: string, walletId: string): Promise<WalletActionResult> {
  if (!(await sessionMember())) return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  const result = await assignWithdrawal(topupId, walletId);
  if (!result.ok) return result;
  refreshPages();
  return { ok: true, id: result.id };
}

/**
 * Remove a wallet — only once it is empty, and never the default. A wallet
 * that never held anything is deleted outright; one with history is archived,
 * so every entry it ever had stays in the history and in the totals.
 */
export async function deleteWallet(walletId: string): Promise<DeleteWalletResult> {
  if (!(await sessionMember())) return { ok: false, error: SESSION_EXPIRED_MESSAGE };

  const { wallets, balanceOf } = await currentBalances();
  const wallet = wallets.find((w) => w.id === walletId);
  if (!wallet) return { ok: false, error: 'הארנק לא נמצא.' };
  if (wallet.is_default) {
    return { ok: false, error: 'זה ארנק ברירת המחדל. קודם בחרו ארנק אחר כברירת מחדל, ואז אפשר להסיר אותו.' };
  }
  const balance = balanceOf(walletId) ?? 0;
  if (Math.abs(balance) >= 0.005) {
    return { ok: false, error: 'יש עוד כסף בארנק. קודם העבירו אותו לארנק אחר או עדכנו את הסכום לאפס.' };
  }

  const supabase = db();
  const counts = await Promise.all([
    supabase.from('cash_topups').select('id', { count: 'exact', head: true }).eq('wallet_id', walletId),
    supabase.from('cash_spends').select('id', { count: 'exact', head: true }).eq('wallet_id', walletId),
    supabase.from('cash_transfers').select('id', { count: 'exact', head: true }).eq('from_wallet_id', walletId),
    supabase.from('cash_transfers').select('id', { count: 'exact', head: true }).eq('to_wallet_id', walletId),
    supabase.from('cash_plans').select('id', { count: 'exact', head: true }).eq('wallet_id', walletId),
  ]);
  const failed = counts.find((c) => c.error);
  if (failed?.error) return dbFail(failed.error);
  const hasHistory = counts.some((c) => (c.count ?? 0) > 0);

  const { error } = hasHistory
    ? await supabase.from('cash_wallets').update({ is_archived: true }).eq('id', walletId)
    : await supabase.from('cash_wallets').delete().eq('id', walletId);
  if (error) return dbFail(error);
  refreshPages();
  return { ok: true, id: walletId, outcome: hasHistory ? 'archived' : 'deleted' };
}
