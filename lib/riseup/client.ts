import { env } from '@/lib/env';
import type { RiseupTransaction } from '@/lib/types';

const TOKENS_URL = 'https://input.riseup.co.il/developer/tokens';

export class RiseupAuthError extends Error {}
export class RiseupApiError extends Error {}

/**
 * RiseUp's external API is read-only — there is no endpoint that writes a
 * transaction, which is the entire reason this app exists. Everything here is
 * a GET, deliberately.
 */
async function riseupGet<T>(path: string): Promise<T> {
  const url = `${env.riseupApiBase}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.riseupPat}`,
        Accept: 'application/json',
      },
    });
  } catch (error) {
    throw new RiseupApiError(
      `Network error calling RiseUp: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (response.status === 401) {
    throw new RiseupAuthError(
      `RiseUp rejected the token (401). PATs expire after 30 days — mint a new one at ${TOKENS_URL}`,
    );
  }
  if (response.status === 403) {
    throw new RiseupAuthError(
      `RiseUp token is missing the budget:read scope (403). Recreate it at ${TOKENS_URL}`,
    );
  }
  if (response.status === 429) {
    throw new RiseupApiError('RiseUp rate limit hit (429). The next scheduled sync will retry.');
  }
  if (!response.ok) {
    const body = await response.text();
    throw new RiseupApiError(`RiseUp API ${response.status}: ${body.slice(0, 200)}`);
  }

  return (await response.json()) as T;
}

interface TransactionsResponse {
  transactions?: RiseupTransaction[];
}

/** Transactions for one cashflow month, e.g. "2026-09". */
export async function fetchTransactions(cashflowMonth: string): Promise<RiseupTransaction[]> {
  const payload = await riseupGet<TransactionsResponse>(
    `/api/external/transactions?cashflowMonth=${encodeURIComponent(cashflowMonth)}`,
  );
  return payload.transactions ?? [];
}

/** "2026-09" for the current month, and N months back from it. */
export function recentMonths(count: number, today = new Date()): string[] {
  const months: string[] = [];
  const cursor = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
  );
  for (let i = 0; i < count; i += 1) {
    const year = cursor.getUTCFullYear();
    const month = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return months;
}
