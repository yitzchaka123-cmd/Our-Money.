import { db } from '@/lib/db/client';
import { defaultWalletId } from '@/lib/db/queries';
import { recordRiseupCategories } from '@/lib/intake/categories';
import {
  fetchBudget,
  fetchTransactions,
  recentMonths,
  RiseupApiError,
  RiseupAuthError,
} from '@/lib/riseup/client';
import { normalizeBudget, type NormalizedEnvelope } from '@/lib/riseup/envelopes';
import {
  isWithdrawal,
  matchManualWithdrawals,
  toDateOnly,
  WITHDRAWAL_MATCH_WINDOW_DAYS,
} from '@/lib/riseup/withdrawals';
import type { CashTopup, RiseupTransaction } from '@/lib/types';

export type SyncErrorKind = 'auth' | 'rate_limit' | 'network' | 'other';

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
    await finish({ status: 'failed', error: message, error_kind: errorKind(error) });

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

function errorKind(error: unknown): SyncErrorKind {
  if (error instanceof RiseupAuthError) return 'auth';
  if (error instanceof RiseupApiError) return error.kind;
  return 'other';
}

/** A run still marked running after this long crashed without finishing. */
const RUNNING_GIVES_UP_MS = 2 * 60 * 1000;

/**
 * Sync unless the mirror is already fresh or another sync is mid-flight.
 * Both the dashboard's refresh-on-open and its refresh button go through here,
 * so two phones opening the page at once cost RiseUp one pull, not two.
 */
export async function syncIfStale(
  freshForMs: number,
  monthsBack = 2,
): Promise<{ skipped: true; reason: 'fresh' | 'running' } | { skipped: false; result: SyncResult }> {
  const { data } = await db()
    .from('sync_runs')
    .select('started_at, status')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const last = data?.started_at ? Date.parse(data.started_at as string) : 0;
  const age = Date.now() - last;
  if (data?.status === 'running' && age < RUNNING_GIVES_UP_MS) return { skipped: true, reason: 'running' };
  if (data?.status === 'succeeded' && age < freshForMs) return { skipped: true, reason: 'fresh' };

  return { skipped: false, result: await syncRiseup(monthsBack) };
}

export interface SyncState {
  lastSuccessAt: string | null;
  lastFailure: { at: string; kind: SyncErrorKind; message: string } | null;
}

/** The latest success and, if it came after that, the latest failure. */
export async function loadSyncState(): Promise<SyncState> {
  const supabase = db();
  const [{ data: success }, { data: failure }] = await Promise.all([
    supabase
      .from('sync_runs')
      .select('finished_at')
      .eq('status', 'succeeded')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('sync_runs')
      .select('finished_at, error, error_kind')
      .eq('status', 'failed')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lastSuccessAt = (success?.finished_at as string | undefined) ?? null;
  const failedAt = (failure?.finished_at as string | undefined) ?? null;
  const failureIsCurrent = failedAt && (!lastSuccessAt || failedAt > lastSuccessAt);

  return {
    lastSuccessAt,
    lastFailure: failureIsCurrent
      ? {
          at: failedAt,
          kind: ((failure?.error_kind as SyncErrorKind | null) ?? 'other'),
          message: (failure?.error as string | null) ?? '',
        }
      : null,
  };
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

  // Someone may have already said "I withdrew 500" to the bot. That row is the
  // same cash, so link it to the bank line instead of counting it twice.
  const unmatched = await linkManualWithdrawals(fresh);
  if (unmatched.length === 0) return [];

  // Cash from the machine goes into whichever wallet is the default.
  const walletId = await defaultWalletId();
  const { data: inserted, error: insertError } = await supabase
    .from('cash_topups')
    .insert(
      unmatched.map((w) => ({
        amount_ils: w.amount,
        occurred_at: toDateOnly(w.transactionDate),
        source: 'riseup_withdrawal' as const,
        riseup_transaction_id: w.transactionId,
        business_name: w.businessName ?? null,
        wallet_id: walletId,
      })),
    )
    .select('*');
  if (insertError) throw new Error(`Failed to create top-ups: ${insertError.message}`);

  return (inserted ?? []) as CashTopup[];
}

/** Returns the bank withdrawals that had no hand-entered twin. */
async function linkManualWithdrawals(fresh: RiseupTransaction[]): Promise<RiseupTransaction[]> {
  const supabase = db();
  const dates = fresh.map((w) => toDateOnly(w.transactionDate)).filter((d): d is string => !!d).sort();
  if (dates.length === 0) return fresh;

  const shift = (date: string, days: number) =>
    new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

  const { data: candidates, error } = await supabase
    .from('cash_topups')
    .select('id, amount_ils, occurred_at')
    .eq('source', 'manual')
    .eq('is_dismissed', false)
    .is('riseup_transaction_id', null)
    .gte('occurred_at', shift(dates[0]!, -WITHDRAWAL_MATCH_WINDOW_DAYS))
    .lte('occurred_at', shift(dates[dates.length - 1]!, WITHDRAWAL_MATCH_WINDOW_DAYS));
  if (error) throw new Error(`Failed to look for manual withdrawals: ${error.message}`);

  const { links, unmatched } = matchManualWithdrawals(fresh, candidates ?? []);
  for (const { transaction, manualId } of links) {
    // The manual row keeps its wallet, note and date: those came from a person.
    const { error: linkError } = await supabase
      .from('cash_topups')
      .update({
        riseup_transaction_id: transaction.transactionId,
        business_name: transaction.businessName ?? null,
      })
      .eq('id', manualId);
    if (linkError) throw new Error(`Failed to link a manual withdrawal: ${linkError.message}`);
  }
  return unmatched;
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
