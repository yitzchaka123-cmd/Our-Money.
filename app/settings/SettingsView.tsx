import type { ReactNode } from 'react';

import { NameEditor } from '@/app/settings/NameEditor';
import { Bank, ChevronLeft, ChevronRight, Download, SparkleBubble } from '@/app/dashboard/components/icons';
import { Chat, CreditCard, Lock, LogOut } from '@/app/dashboard/components/icons-extra';
import type { AccountKind } from '@/lib/dashboard/accounts';
import { monthLabel } from '@/lib/money';

export interface SettingsData {
  /** The name you chose; null until you choose one. */
  preferredName: string | null;
  /** Your Telegram account's name, shown only as where you are signed in from. */
  telegramName: string;
  members: { id: string; name: string; telegramName: string; isYou: boolean }[];
  accounts: { key: string; name: string; provider: string; kind: AccountKind; named: boolean }[];
  lastSync: string | null;
  month: string;
  yearAgo: string;
}

/**
 * A small settings page (feedback video 1, item 25), laid out like RiseUp's:
 * a coloured header with your name and the one thing you can edit, then
 * rows. Everything below the name is read-only — RiseUp's connection is, and
 * the page says so.
 *
 * A pure function of its data so scripts/preview-c.tsx can render it.
 */
export function SettingsView({ data }: { data: SettingsData }) {
  const shown = data.preferredName ?? data.telegramName;
  const initial = (shown.trim()[0] ?? '?').toUpperCase();
  const unnamed = data.accounts.filter((a) => !a.named).length;

  return (
    <div className="app settings-page">
      <header className="appbar">
        <a className="icon-btn" href="/dashboard" aria-label="חזרה">
          <ChevronRight />
        </a>
        <span className="icon-btn" aria-hidden="true">
          <SparkleBubble />
        </span>
      </header>

      <section className="settings-hero">
        <span className="settings-avatar" aria-hidden="true">{initial}</span>
        <h1 className="settings-name">{data.preferredName ?? 'עוד לא בחרת שם'}</h1>
        <p className="settings-sub">בטלגרם: {data.telegramName}</p>
        <NameEditor name={data.preferredName} />
      </section>

      <SettingsGroup title="חשבונות מחוברים">
        {data.accounts.length === 0 ? (
          <p className="settings-empty">עוד אין חשבונות. הם יופיעו אחרי הסנכרון הראשון מרייזאפ.</p>
        ) : (
          data.accounts.map((a) => (
            <div key={a.key} className="settings-row settings-row--static">
              <span className="settings-ico">
                {a.kind === 'bank' ? <Bank /> : <CreditCard />}
              </span>
              <span className="settings-row-text">
                <span className="settings-row-title">{a.name}</span>
                {a.named ? <span className="settings-row-sub">{a.provider}</span> : null}
              </span>
            </div>
          ))
        )}
        <a className="settings-row settings-link" href="/accounts">
          <span className="settings-row-text">
            <span className="settings-row-title">
              {unnamed > 0 ? `לתת שמות לכרטיסים (${unnamed} בלי שם)` : 'לשנות שמות של כרטיסים'}
            </span>
          </span>
          <span className="settings-chev">
            <ChevronLeft size={20} />
          </span>
        </a>
      </SettingsGroup>

      <SettingsGroup title="מחוברים בטלגרם">
        {data.members.map((m) => (
          <div key={m.id} className="settings-row settings-row--static">
            <span className="settings-ico">
              <Chat />
            </span>
            <span className="settings-row-text">
              <span className="settings-row-title">
                {m.name}
                {m.isYou ? <span className="settings-you">אני</span> : null}
              </span>
              {m.name !== m.telegramName ? <span className="settings-row-sub">בטלגרם: {m.telegramName}</span> : null}
            </span>
          </div>
        ))}
      </SettingsGroup>

      <SettingsGroup title="החיבור לרייזאפ">
        <div className="settings-row settings-row--static">
          <span className="settings-ico">
            <Lock />
          </span>
          <span className="settings-row-text">
            <span className="settings-row-title">קריאה בלבד</span>
            <span className="settings-row-sub">
              אנחנו רק קוראים מרייזאפ. שום דבר כאן לא משנה את החשבון שלכם שם.
              {data.lastSync ? ` סנכרון אחרון: ${data.lastSync}.` : ''}
            </span>
          </span>
        </div>
      </SettingsGroup>

      <SettingsGroup title="ייצוא">
        <a className="settings-row settings-link" href={`/api/export?from=${data.month}&to=${data.month}`} download>
          <span className="settings-ico">
            <Download />
          </span>
          <span className="settings-row-text">
            <span className="settings-row-title">ייצוא {monthLabel(data.month).split(' ')[0]} לאקסל</span>
          </span>
        </a>
        <a className="settings-row settings-link" href={`/api/export?from=${data.yearAgo}&to=${data.month}`} download>
          <span className="settings-ico">
            <Download />
          </span>
          <span className="settings-row-text">
            <span className="settings-row-title">ייצוא השנה האחרונה</span>
          </span>
        </a>
      </SettingsGroup>

      <form method="post" action="/api/auth/logout" className="settings-group settings-logout">
        <button type="submit" className="settings-row settings-link">
          <span className="settings-ico">
            <LogOut />
          </span>
          <span className="settings-row-text">
            <span className="settings-row-title">יציאה</span>
          </span>
        </button>
      </form>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h2 className="settings-group-title">{title}</h2>
      {children}
    </section>
  );
}
