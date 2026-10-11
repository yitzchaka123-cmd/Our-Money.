import { loadAccountLabels } from '@/lib/dashboard/account-labels';
import { summarizeAccounts, type AccountRef, type AccountRow, type AccountSummary } from '@/lib/dashboard/accounts';
import { db } from '@/lib/db/client';

/**
 * Every card and bank account RiseUp has shown us, each with this month's
 * charges as the dashboard counts them (the month's envelope actuals). The
 * transaction mirror supplies accounts with nothing this month and RiseUp's
 * sourceType, which tells a card from a bank account.
 */
export async function loadAccountSummaries(month: string): Promise<AccountSummary[]> {
  const supabase = db();
  const [{ data: known }, { data: monthRows }, labels] = await Promise.all([
    supabase.from('riseup_transactions').select('source, source_type, account_number_hash, account_nickname'),
    supabase
      .from('riseup_envelope_actuals')
      .select('source, account_number_hash, account_nickname, amount_ils, is_income')
      .eq('month', month),
    loadAccountLabels(),
  ]);

  return summarizeAccounts({
    known: ((known ?? []) as Record<string, string | null>[]).map(
      (r): AccountRef => ({
        source: r.source ?? null,
        hash: r.account_number_hash ?? null,
        nickname: r.account_nickname ?? null,
        sourceType: r.source_type ?? null,
      }),
    ),
    monthRows: ((monthRows ?? []) as Record<string, unknown>[]).map(
      (r): AccountRow => ({
        source: (r.source as string | null) ?? null,
        hash: (r.account_number_hash as string | null) ?? null,
        nickname: (r.account_nickname as string | null) ?? null,
        amountIls: r.amount_ils as number | string | null,
        isIncome: r.is_income as boolean | null,
      }),
    ),
    labels,
  });
}
