import { cookies } from 'next/headers';

import { Amount } from '@/app/dashboard/components/Amount';
import { shortDate } from '@/app/dashboard/components/EnvelopeCard';
import { ChevronRight, Heart, Mic, SparkleBubble } from '@/app/dashboard/components/icons';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { isoDateInIsrael } from '@/lib/intake/parse';
import { friendlyDate } from '@/lib/money';
import type { CashSpend } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The counterpart to RiseUp's daily brief: the cash entries the AI intake was
 * unsure about, so they can be confirmed in one pass instead of one bot message
 * at a time.
 */
export default async function DailyPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token || !verifySessionToken(token)) return <SignedOut />;

  const supabase = db();
  const [{ data: pending }, { data: recent }, { data: members }] = await Promise.all([
    supabase
      .from('cash_spends')
      .select('*')
      .eq('status', 'needs_review')
      .order('created_at', { ascending: false }),
    supabase
      .from('cash_spends')
      .select('*')
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(15),
    supabase.from('household_members').select('id, display_name'),
  ]);

  const names = new Map((members ?? []).map((m) => [m.id as string, m.display_name as string]));
  const today = isoDateInIsrael();
  const toReview = (pending ?? []) as CashSpend[];

  return (
    <div className="app">
      <header className="appbar">
        <a className="icon-btn" href="/dashboard" aria-label="חזרה">
          <ChevronRight />
        </a>
        <span className="icon-btn" aria-hidden="true">
          <SparkleBubble />
        </span>
      </header>

      <h1 className="page-title">המזומן היומי</h1>

      {toReview.length === 0 ? (
        <div className="tip">
          <p className="tip-title">
            <span style={{ color: 'var(--primary)' }}>
              <Heart />
            </span>
            הכול מאושר
          </p>
          <p style={{ margin: 0 }}>אין רישומים שממתינים לאישור. אפשר להמשיך לרשום בבוט.</p>
        </div>
      ) : (
        <>
          <div className="tip">
            <p className="tip-title">
              <span style={{ color: 'var(--primary)' }}>
                <Heart />
              </span>
              {toReview.length} רישומים לאישור
            </p>
            <p style={{ margin: 0 }}>
              לא הייתי בטוח בסכום או בקטגוריה. אישור או תיקון מהיר בבוט — <strong>/undo</strong>{' '}
              מוחק את האחרון.
            </p>
          </div>

          <div className="section">
            {toReview.map((spend) => (
              <SpendCard key={spend.id} spend={spend} names={names} today={today} pending />
            ))}
          </div>
        </>
      )}

      <h2 className="page-title" style={{ fontSize: 20 }}>
        נרשם לאחרונה
      </h2>
      <div className="section">
        {((recent ?? []) as CashSpend[]).map((spend) => (
          <SpendCard key={spend.id} spend={spend} names={names} today={today} />
        ))}
        {(recent ?? []).length === 0 ? (
          <article className="card">
            <div className="card-body notice">
              <p>עוד לא נרשמו הוצאות מזומן.</p>
            </div>
          </article>
        ) : null}
      </div>
    </div>
  );
}

function SpendCard({
  spend,
  names,
  today,
  pending,
}: {
  spend: CashSpend;
  names: Map<string, string>;
  today: string;
  pending?: boolean;
}) {
  return (
    <article className="card envelope" data-type={pending ? 'cashUnlogged' : 'cash'}>
      <div className="card-body">
        <div className="card-head" style={{ marginBottom: 10 }}>
          <h3 className="card-title" style={{ fontSize: 17 }}>
            {spend.note || spend.category}
          </h3>
          <Amount value={Number(spend.amount_ils)} className="figure-actual" />
        </div>
        <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14 }}>
          {spend.input_kind === 'voice' ? (
            <span style={{ marginInlineEnd: 6, verticalAlign: 'middle' }}>
              <Mic />
            </span>
          ) : null}
          {spend.category} · {names.get(spend.member_id) ?? '—'} ·{' '}
          {friendlyDate(spend.spent_at, today)}
        </p>
        {spend.transcript ? (
          <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 14 }}>
            “{spend.transcript}”
          </p>
        ) : null}
        <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 13 }}>
          {shortDate(spend.spent_at)}
        </p>
      </div>
    </article>
  );
}

function SignedOut() {
  return (
    <div className="app">
      <div className="section">
        <div className="card">
          <div className="card-body notice">
            <h1>צריך קישור כניסה</h1>
            <p>
              שלחו <strong>/dashboard</strong> לבוט בטלגרם.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
