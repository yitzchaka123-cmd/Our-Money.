import type { CSSProperties } from 'react';

import { AccountNameEditor } from '@/app/accounts/AccountNameEditor';
import { Amount } from '@/app/dashboard/components/Amount';
import { Alert, Bank, ChevronRight, Coins, Heart, SparkleBubble } from '@/app/dashboard/components/icons';
import { CreditCard } from '@/app/dashboard/components/icons-extra';
import type { AccountSummary } from '@/lib/dashboard/accounts';
import { monthLabel } from '@/lib/money';

export interface AccountsPageData {
  month: string;
  /** "11.10.26, 11:20" — the last successful pull from RiseUp. */
  updated: string | null;
  accounts: AccountSummary[];
  cash: { balance: number; walletCount: number };
}

/**
 * RiseUp's "מצב העו״ש והאשראי", as far as the data allows: one card per bank
 * account and per credit card, with this month's charges and the couple's own
 * name for it. RiseUp's connection shares no balances or credit limits, and
 * the page says so once rather than showing a made-up figure.
 *
 * A pure function of its data so scripts/preview-c.tsx can render it.
 */
export function AccountsView({ data }: { data: AccountsPageData }) {
  const monthName = monthLabel(data.month).split(' ')[0] ?? data.month;
  const banks = data.accounts.filter((a) => a.kind === 'bank');
  const cards = data.accounts.filter((a) => a.kind !== 'bank');
  const cardTotal = Math.round(cards.reduce((s, a) => s + a.monthCharges, 0) * 100) / 100;

  return (
    <div className="app accounts-page">
      <header className="appbar">
        <a className="icon-btn" href="/dashboard" aria-label="חזרה">
          <ChevronRight />
        </a>
        <span className="icon-btn" aria-hidden="true">
          <SparkleBubble />
        </span>
      </header>

      <h1 className="page-title">מצב העו״ש והאשראי</h1>
      <p className="accounts-honest">
        רייזאפ לא משתפים יתרות ומסגרות אשראי דרך החיבור, אז כאן מופיעים החיובים של כל חשבון ב{monthName}.
      </p>

      <div className="tip">
        <p className="tip-title">
          <span style={{ color: 'var(--primary)' }}>
            <Heart />
          </span>
          טיפ מאיתנו
        </p>
        <p style={{ margin: 0 }}>
          רייזאפ לא שולחים את מספר הכרטיס. תנו לכל כרטיס וחשבון שם פעם אחת — למשל ״כרטיס 0848״ — והוא יופיע בכל
          מקום בתזרים.
        </p>
      </div>

      {data.accounts.length === 0 ? (
        <div className="section">
          <article className="card">
            <div className="card-body notice">
              <h1>עוד אין חשבונות</h1>
              <p>אחרי הסנכרון הראשון מרייזאפ יופיעו כאן הכרטיסים והחשבונות שלכם.</p>
            </div>
          </article>
        </div>
      ) : null}

      {banks.length > 0 ? (
        <>
          <SectionLabel accent="var(--income)" icon={<Bank size={16} />} label="חשבונות בנק" />
          <div className="section">
            {banks.map((a) => (
              <AccountCard key={a.key} account={a} monthName={monthName} updated={data.updated} />
            ))}
          </div>
        </>
      ) : null}

      {cards.length > 0 ? (
        <>
          <SectionLabel accent="var(--goal)" icon={<CreditCard size={16} />} label="כרטיסי אשראי" />
          <p className="accounts-total">
            סה״כ חיובים ב{monthName}: <Amount value={cardTotal} />
          </p>
          <div className="section">
            {cards.map((a) => (
              <AccountCard key={a.key} account={a} monthName={monthName} updated={data.updated} />
            ))}
          </div>
        </>
      ) : null}

      <SectionLabel accent="var(--tracking)" icon={<Coins size={16} />} label="מזומן" />
      <div className="section">
        <article className="card account-card">
          <div className="card-body">
            <p className="account-provider">{data.cash.walletCount > 1 ? 'ארנקי מזומן' : 'ארנק מזומן'}</p>
            <p className="account-sub">מה שאמור להיות במזומן עכשיו, לפי מה שנרשם</p>
            <Amount
              value={data.cash.balance}
              className={data.cash.balance < 0 ? 'account-figure is-negative' : 'account-figure'}
            />
          </div>
          <a className="account-foot account-link" href="/dashboard">
            לניהול הארנקים בתזרים
          </a>
        </article>
      </div>

      <p className="disclaimer">
        <span style={{ flex: '0 0 auto', color: 'var(--muted)' }}>
          <Alert />
        </span>
        <span>
          הנתונים מגיעים מרייזאפ בקריאה בלבד. השמות שתתנו לכרטיסים נשמרים אצלנו ולא משנים דבר בחשבון הרייזאפ שלכם.
        </span>
      </p>
    </div>
  );
}

function SectionLabel({ accent, icon, label }: { accent: string; icon: React.ReactNode; label: string }) {
  return (
    <div className="section-label" style={{ '--accent': accent } as CSSProperties}>
      <span className="rule" />
      <span className="chip">
        {icon}
        {label}
      </span>
    </div>
  );
}

function AccountCard({ account, monthName, updated }: { account: AccountSummary; monthName: string; updated: string | null }) {
  const named = Boolean(account.label || account.nickname);
  return (
    <article className="card account-card">
      <div className="card-body">
        {updated ? <p className="account-updated">מעודכן ל-{updated}</p> : null}
        <p className="account-provider">{named ? account.displayName : account.provider}</p>
        {named ? <p className="account-sub">{account.provider}</p> : null}
        <p className="account-figure-label">
          חיובים ב{monthName}
          {account.monthChargeCount > 0 ? ` · ${account.monthChargeCount}` : ''}
        </p>
        <Amount
          value={account.monthCharges > 0 ? -account.monthCharges : 0}
          className={account.monthCharges > 0 ? 'account-figure is-negative' : 'account-figure is-zero'}
        />
        {account.monthCredits > 0 ? (
          <p className="account-credits">
            נכנס ב{monthName}: <Amount value={account.monthCredits} />
          </p>
        ) : null}
      </div>
      <AccountNameEditor source={account.source} hash={account.hash} label={account.label} kind={account.kind} />
    </article>
  );
}
