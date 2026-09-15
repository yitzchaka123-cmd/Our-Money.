import { cookies } from 'next/headers';

import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { currentMonth, loadDashboard } from '@/lib/dashboard/data';
import { DashboardView } from '@/app/dashboard/view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token || !verifySessionToken(token)) return <SignedOut />;

  const params = await searchParams;
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : currentMonth();

  return <DashboardView data={await loadDashboard(month)} />;
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
