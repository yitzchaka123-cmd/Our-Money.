import { cookies } from 'next/headers';

import { Amount } from '@/app/dashboard/components/Amount';
import { Alert, ChevronRight, Heart, SparkleBubble } from '@/app/dashboard/components/icons';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { walletState } from '@/lib/reconcile';
import type { CashSpend, CashTopup } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token || !verifySessionToken(token)) return <SignedOut />;

  const supabase = db();
  const [{ data: topups }, { data: spends }, { data: members }] = await Promise.all([
    supabase.from('cash_topups').select('*').eq('is_dismissed', false),
    supabase.from('cash_spends').select('*').neq('status', 'deleted'),
    supabase.from('household_members').select('display_name'),
  ]);

  const wallet = walletState(
    (topups ?? []) as CashTopup[],
    (spends ?? []) as CashSpend[],
  );
  const holder = (members ?? [])[0]?.display_name ?? '';

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

      <h1 className="page-title">מצב העו״ש</h1>

      <div className="tip">
        <p className="tip-title">
          <span style={{ color: 'var(--primary)' }}>
            <Heart />
          </span>
          טיפ מאיתנו
        </p>
        <p style={{ margin: 0 }}>
          כל מה שנמשך מהכספומט מופיע כאן כארנק מזומן. ככל שתרשמו יותר הוצאות בבוט, כך המספר
          הזה יהיה מדויק יותר.
        </p>
      </div>

      <div className="section-label envelope" data-type="cash" style={{ '--accent': 'var(--income)' } as React.CSSProperties}>
        <span className="rule" />
        <span className="chip">ארנק מזומן</span>
      </div>

      <div className="section">
        <article className="card">
          <div className="card-body">
            <p className="drawer-updated" style={{ margin: 0 }}>
              {wallet.topupCount} משיכות · {wallet.spendCount} רישומים
            </p>
            <p className="card-title" style={{ marginTop: 6 }}>
              מזומן בארנק
            </p>
            {holder ? <p style={{ margin: 0 }}>{holder}</p> : null}
            <Amount
              value={wallet.unaccounted}
              className={
                wallet.unaccounted < 0 ? 'account-figure is-negative' : 'account-figure'
              }
            />
          </div>
          <div className="account-foot">
            נמשך <Amount value={wallet.toppedUp} /> · נרשם <Amount value={wallet.logged} />
          </div>
        </article>
      </div>

      <div
        className="section-label"
        style={{ '--accent': 'var(--muted)' } as React.CSSProperties}
      >
        <span className="rule" />
        <span className="chip">יתרות בנק ואשראי</span>
      </div>

      <div className="section">
        <article className="card">
          <div className="card-body">
            <p style={{ margin: 0 }}>
              יתרות העו״ש והאשראי עוד לא זמינות: ה-API הציבורי של רייזאפ קורא כרגע רק תזרים
              ועסקאות. ברגע ש-<code>get_balances</code> ייצא, הן יופיעו כאן באותו מבנה.
            </p>
          </div>
        </article>
      </div>

      <p className="disclaimer">
        <span style={{ flex: '0 0 auto', color: 'var(--muted)' }}>
          <Alert />
        </span>
        <span>
          הנתונים כאן מגיעים מרייזאפ בקריאה בלבד ומהרישומים שלכם בבוט. הם לא משנים דבר בחשבון
          הרייזאפ שלכם.
        </span>
      </p>
    </div>
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
