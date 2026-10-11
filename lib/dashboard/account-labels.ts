import type { AccountLabel } from '@/lib/dashboard/accounts';
import { db } from '@/lib/db/client';

/**
 * The couple's names for their cards and accounts. A failure (say, before the
 * table exists) is not worth breaking a page over: without labels every
 * account still reads as its provider's name.
 */
export async function loadAccountLabels(): Promise<AccountLabel[]> {
  const { data, error } = await db().from('account_labels').select('source, account_number_hash, label');
  if (error) {
    console.error('Account labels unavailable:', error.message);
    return [];
  }
  return ((data ?? []) as { source: string; account_number_hash: string; label: string }[]).map((row) => ({
    source: row.source,
    accountNumberHash: row.account_number_hash,
    label: row.label,
  }));
}
