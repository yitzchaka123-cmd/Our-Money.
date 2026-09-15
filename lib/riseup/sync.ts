import { db } from '@/lib/db/client';
import { recordRiseupCategories } from '@/lib/intake/categories';
import { fetchTransactions, recentMonths, RiseupAuthError } from '@/lib/riseup/client';
import { isWithdrawal, toDateOnly } from '@/lib/riseup/withdrawals';
import type { CashTopup, RiseupTransaction } from '@/lib/types';

export interface SyncResult {
  months: string[];
  transactionsUpserted: number;
  newTopups: CashTopup[];
  tokenExpired: boolean;
  error: string | null;
}

function toRow(transaction: RiseupTransaction) {
  return {
    transaction_id: transaction.transactionId,
    transaction_date: toDateOnly(transaction.transactionDate),
    billing_date: toDateOnly(transaction.billingDate),
    cashflow_month: transaction.cashflowDate ?? null,
    business_name: transaction.businessName ?? null,
    amount_ils: transaction.amount ?? null,
    is_income: transaction.isIncome ?? false,
    source: transaction.source ?? null,
    source_type: transaction.sourceType ?? null,
    account_nickname: transaction.accountNickname ?? null,
    account_number_hash: transaction.accountNumberHash ?? null,
    category_label: transaction.categoryLabel ?? null,
    category_type: transaction.categoryType ?? null,
    is_withdrawal: isWithdrawal(transaction),
    raw: transaction,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Pull recent RiseUp transactions, mirror them locally, and turn every ATM
 * withdrawal into a cash wallet top-up.
 *
 * Idempotent on both halves: transactions upsert on their primary key, and
 * top-ups carry a unique riseup_transaction_id, so re-running a month adds
 * nothing. A top-up the couple has dismissed stays dismissed.
 */
export async function syncRiseup(monthsBack = 2): Promise<SyncResult> {
  const supabase = db();
  const months = recentMonths(monthsBack);

  const { data: run } = await supabase
    .from('sync_runs')
    .insert({ months, status: 'running' })
    .select('id')
    .single();
  const runId = run?.id as string | undefined;

  const finish = async (patch: Record<string, unknown>) => {
    if (!runId) return;
    await supabase
      .from('sync_runs')
      .update({ finished_at: new Date().toISOString(), ...patch })
      .eq('id', runId);
  };

  try {
    const transactions: RiseupTransaction[] = [];
    for (const month of months) {
      transactions.push(...(await fetchTransactions(month)));
    }

    if (transactions.length > 0) {
      const { error } = await supabase
        .from('riseup_transactions')
        .upsert(transactions.map(toRow), { onConflict: 'transaction_id' });
      if (error) throw new Error(`Failed to store transactions: ${error.message}`);
    }

    await recordRiseupCategories(
      transactions.map((t) => t.categoryLabel ?? '').filter(Boolean),
    );

    const newTopups = await createTopupsForWithdrawals(transactions);

    await finish({
      status: 'succeeded',
      transactions_upserted: transactions.length,
      topups_created: newTopups.length,
    });

    return {
      months,
      transactionsUpserted: transactions.length,
      newTopups,
      tokenExpired: false,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish({ status: 'failed', error: message });

    return {
      months,
      transactionsUpserted: 0,
      newTopups: [],
      tokenExpired: error instanceof RiseupAuthError,
      error: message,
    };
  }
}

async function createTopupsForWithdrawals(
  transactions: RiseupTransaction[],
): Promise<CashTopup[]> {
  const withdrawals = transactions.filter(isWithdrawal);
  if (withdrawals.length === 0) return [];

  const supabase = db();
  const ids = withdrawals.map((w) => w.transactionId);

  // Includes dismissed rows on purpose: a withdrawal the couple rejected must
  // not come back on the next sync.
  const { data: known, error } = await supabase
    .from('cash_topups')
    .select('riseup_transaction_id')
    .in('riseup_transaction_id', ids);
  if (error) throw new Error(`Failed to check existing top-ups: ${error.message}`);

  const seen = new Set((known ?? []).map((row) => row.riseup_transaction_id as string));
  const fresh = withdrawals.filter((w) => !seen.has(w.transactionId));
  if (fresh.length === 0) return [];

  const { data: inserted, error: insertError } = await supabase
    .from('cash_topups')
    .insert(
      fresh.map((w) => ({
        amount_ils: w.amount,
        occurred_at: toDateOnly(w.transactionDate),
        source: 'riseup_withdrawal' as const,
        riseup_transaction_id: w.transactionId,
        business_name: w.businessName ?? null,
      })),
    )
    .select('*');
  if (insertError) throw new Error(`Failed to create top-ups: ${insertError.message}`);

  return (inserted ?? []) as CashTopup[];
}
