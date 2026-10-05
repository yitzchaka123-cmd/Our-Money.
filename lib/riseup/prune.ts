import { db } from '@/lib/db/client';

/**
 * Keep Our Money small inside a shared free-plan database. Only bookkeeping
 * and mirrors are pruned — never a cash entry, a plan or a wallet, and never
 * the envelopes the dashboard's history is built from.
 */
export const RETENTION = {
  /** Sync log: long enough to see a pattern of failures. */
  syncRunsDays: 60,
  /** Sign-in codes and wrong guesses only matter for minutes. */
  loginDays: 1,
  /** The raw transaction mirror is for checking withdrawal detection only. */
  transactionMonths: 6,
};

function monthsAgo(months: number, now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1)).toISOString().slice(0, 7);
}

export async function pruneOldData(now = new Date()): Promise<void> {
  const supabase = db();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

  const results = await Promise.all([
    supabase.from('sync_runs').delete().lt('started_at', daysAgo(RETENTION.syncRunsDays)),
    supabase.from('login_codes').delete().lt('expires_at', daysAgo(RETENTION.loginDays)),
    supabase.from('login_failures').delete().lt('at', daysAgo(RETENTION.loginDays)),
    supabase.from('riseup_transactions').delete().lt('cashflow_month', monthsAgo(RETENTION.transactionMonths, now)),
  ]);
  for (const { error } of results) {
    if (error) console.error('Prune step failed:', error.message);
  }
}
