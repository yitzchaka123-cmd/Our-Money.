import { cookies } from 'next/headers';

import { AccountsView } from '@/app/accounts/AccountsView';
import { SignedOut } from '@/app/SignedOut';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { loadAccountSummaries } from '@/lib/dashboard/account-summaries';
import { currentMonth } from '@/lib/dashboard/data';
import { db } from '@/lib/db/client';
import { walletState } from '@/lib/reconcile';
import { loadSyncState } from '@/lib/riseup/sync';
import type { CashSpend, CashTopup } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RiseUp's "מצב העו״ש והאשראי": every card and account, with this month's charges. */
export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token || !verifySessionToken(token)) return <SignedOut />;

  const params = await searchParams;
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : currentMonth();
  const supabase = db();
  const [accounts, syncState, { data: topups }, { data: spends }, { count: walletCount }] = await Promise.all([
    loadAccountSummaries(month),
    loadSyncState(),
    supabase.from('cash_topups').select('*').eq('is_dismissed', false),
    supabase.from('cash_spends').select('*').neq('status', 'deleted'),
    supabase.from('cash_wallets').select('id', { count: 'exact', head: true }).eq('is_archived', false),
  ]);

  const cash = walletState((topups ?? []) as CashTopup[], (spends ?? []) as CashSpend[]);

  return (
    <AccountsView
      data={{
        month,
        updated: riseupStamp(syncState.lastSuccessAt),
        accounts,
        cash: { balance: cash.unaccounted, walletCount: walletCount ?? 1 },
      }}
    />
  );
}

/** RiseUp's own stamp: "11.10.26, 11:20". */
function riseupStamp(iso: string | null): string | null {
  if (!iso) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'numeric',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}.${get('month')}.${get('year')}, ${get('hour')}:${get('minute')}`;
}
