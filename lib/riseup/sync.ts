import { db } from '@/lib/db/client';
import { recordRiseupCategories } from '@/lib/intake/categories';
import {
  fetchBudget,
  fetchTransactions,
  recentMonths,
  RiseupAuthError,
} from '@/lib/riseup/client';
import { normalizeBudget, type NormalizedEnvelope } from '@/lib/riseup/envelopes';
import { isWithdrawal, toDateOnly } from '@/lib/riseup/withdrawals';
import type { CashTopup, RiseupTransaction } from '@/lib/types';

export interface SyncResult {
  months: string[];
  transactionsUpserted: number;
  envelopesUpserted: number;
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

    // The dashboard is built on envelopes, not on the raw transaction feed, so
    // the budget endpoint is the one that actually feeds the UI.
    let envelopesUpserted = 0;
    for (const month of months) {
      envelopesUpserted += await storeEnvelopes(month, normalizeBudget(await fetchBudget(month)));
    }

    await finish({
      status: 'succeeded',
      transactions_upserted: transactions.length,
      topups_created: newTopups.length,
    });

    return {
      months,
      transactionsUpserted: transactions.length,
      envelopesUpserted,
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
      envelopesUpserted: 0,
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

/**
 * Replace a month's envelopes wholesale. RiseUp re-plans a month as it goes —
 * envelopes appear, disappear and get renamed — so merging would leave stale
 * cards on the dashboard long after they are gone upstream.
 */
async function storeEnvelopes(
  month: string,
  envelopes: NormalizedEnvelope[],
): Promise<number> {
  const supabase = db();

  const { error: clearEnvelopes } = await supabase
    .from('riseup_envelopes')
    .delete()
    .eq('month', month);
  if (clearEnvelopes) throw new Error(`Failed to clear envelopes: ${clearEnvelopes.message}`);

  const { error: clearActuals } = await supabase
    .from('riseup_envelope_actuals')
    .delete()
    .eq('month', month);
  if (clearActuals) throw new Error(`Failed to clear envelope actuals: ${clearActuals.message}`);

  if (envelopes.length === 0) return 0;

  const { error: insertEnvelopes } = await supabase.from('riseup_envelopes').insert(
    envelopes.map((envelope) => ({
      month,
      envelope_id: envelope.envelopeId,
      envelope_type: envelope.type,
      name: envelope.name,
      planned_ils: envelope.plannedIls,
      actual_ils: envelope.actualIls,
      position: envelope.position,
      raw: envelope,
    })),
  );
  if (insertEnvelopes) throw new Error(`Failed to store envelopes: ${insertEnvelopes.message}`);

  const actualRows = envelopes.flatMap((envelope) =>
    envelope.actuals.map((actual) => ({
      month,
      envelope_id: envelope.envelopeId,
      transaction_id: actual.transactionId,
      transaction_date: actual.transactionDate,
      billing_date: actual.billingDate,
      business_name: actual.businessName,
      amount_ils: actual.amountIls,
      is_income: actual.isIncome,
      account_nickname: actual.accountNickname,
      account_number_hash: actual.accountNumberHash,
      source: actual.source,
      is_installment: actual.isInstallment,
      payment_number: actual.paymentNumber,
      total_payments: actual.totalPayments,
      category_label: actual.categoryLabel,
      raw: actual,
    })),
  );

  if (actualRows.length > 0) {
    const { error } = await supabase.from('riseup_envelope_actuals').insert(actualRows);
    if (error) throw new Error(`Failed to store envelope actuals: ${error.message}`);
  }

  return envelopes.length;
}
