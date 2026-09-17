import { cookies } from 'next/headers';

import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { currentMonth, loadDashboard } from '@/lib/dashboard/data';
import { db } from '@/lib/db/client';
import { syncRiseup } from '@/lib/riseup/sync';
import { DashboardView } from '@/app/dashboard/view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Opening the page may pull from RiseUp first; that is a few API calls.
export const maxDuration = 60;

/** How old the RiseUp mirror may be before opening the dashboard refreshes it. */
const FRESH_FOR_MS = 10 * 60 * 1000;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;
  if (!session) return <SignedOut />;

  const params = await searchParams;
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : currentMonth();

  await refreshIfStale();

  return <DashboardView data={await loadDashboard(month)} sessionMemberId={session.memberId} />;
}

/**
 * The workflow is: do the card and bank side in RiseUp, then come here and do
 * the cash. So the page should already be current when it opens — but a pull
 * on every request would burn RiseUp's rate limit, hence the freshness window.
 * A failed pull never blocks the page; the last-synced line says how old it is.
 */
async function refreshIfStale(): Promise<void> {
  try {
    const { data } = await db()
      .from('sync_runs')
      .select('started_at, status')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const last = data?.started_at ? Date.parse(data.started_at as string) : 0;
    const running = data?.status === 'running' && Date.now() - last < 2 * 60 * 1000;
    if (running || Date.now() - last < FRESH_FOR_MS) return;

    await syncRiseup();
  } catch (error) {
    console.error('Refresh on open failed', error);
  }
}

function SignedOut() {
  return (
    <div className="shell">
      <div className="card notice">
        <h1>צריך קישור כניסה</h1>
        <p>
          שלחו <strong>/dashboard</strong> לבוט בטלגרם והוא ישלח לכם קישור אישי שתקף לשבוע.
        </p>
      </div>
    </div>
  );
}
