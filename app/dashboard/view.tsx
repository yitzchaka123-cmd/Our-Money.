'use client';

import { useEffect, useState } from 'react';

import { AccountFilterSheet } from '@/app/dashboard/components/AccountFilterSheet';

import { DailyBriefBlob } from '@/app/dashboard/components/Blob';
import { EnvelopeList } from '@/app/dashboard/components/EnvelopeList';
import { HeroCard } from '@/app/dashboard/components/HeroCard';
import { RefreshButton } from '@/app/dashboard/components/RefreshButton';
import { SearchSheet } from '@/app/dashboard/components/SearchSheet';
import { Shell } from '@/app/dashboard/components/Shell';
import { ChevronLeft, Clover } from '@/app/dashboard/components/icons';
import { filterDashboard, listAccounts, parseHidden } from '@/lib/dashboard/account-filter';
import type { DashboardData } from '@/lib/dashboard/data';
import { isoDateInIsrael } from '@/lib/dates';
import { monthLabel } from '@/lib/money';

/**
 * The whole dashboard as a pure function of its data, so
 * `scripts/preview-dashboard.tsx` can render the real thing against fixtures.
 */
export function DashboardView({
  data,
  sessionMemberId = null,
  expandAll = false,
  previewHiddenAccounts,
}: {
  data: DashboardData;
  /** Who is signed in — the default "who" on a new cash entry. */
  sessionMemberId?: string | null;
  /** Preview-only: renders every breakdown open so it can be screenshotted. */
  expandAll?: boolean;
  /** Preview-only: accounts hidden by the filter, as if chosen earlier. */
  previewHiddenAccounts?: string[];
}) {
  const today = isoDateInIsrael();
  const monthName = monthLabel(data.month).split(' ')[0] ?? data.month;
  const [search, setSearch] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [hiddenAccounts, setHiddenAccounts] = useState<Set<string>>(() => new Set(previewHiddenAccounts ?? []));
  useEffect(() => {
    if (previewHiddenAccounts) return;
    try {
      setHiddenAccounts(parseHidden(window.localStorage.getItem(HIDDEN_ACCOUNTS_KEY)));
    } catch {
      // Storage blocked: every account shows.
    }
  }, [previewHiddenAccounts]);
  const applyHidden = (next: Set<string>) => {
    setHiddenAccounts(next);
    try {
      window.localStorage.setItem(HIDDEN_ACCOUNTS_KEY, JSON.stringify([...next]));
    } catch {
      // Storage blocked: the choice lasts until the page reloads.
    }
  };
  const accounts = listAccounts(data.envelopes);
  const filtering = accounts.some((a) => hiddenAccounts.has(a.key));
  // RiseUp's "חשבונות להצגה": a view of the same data, nothing stored server-side.
  const shown = filtering ? filterDashboard(data, hiddenAccounts) : data;

  return (
    <Shell
      month={data.month}
      months={data.months}
      userName={data.userName}
      lastUpdated={data.lastUpdated}
      briefCount={data.briefCount}
      onSearch={() => setSearch(true)}
      onFilter={() => setFilterOpen(true)}
    >
      <div className="app">
        <div className="steps-section">
          {data.syncBanner && (
            <div className={`sync-banner ${data.syncBanner.tone}`} role="status">
              <span>{data.syncBanner.text}</span>
              <RefreshButton />
            </div>
          )}
          <div className="steps-banner">
            <Clover />
            <span>
              השלמת <strong>2 צעדים</strong> והתחלת לצמוח!
            </span>
            <span style={{ marginInlineStart: 'auto' }}>
              <ChevronLeft size={20} />
            </span>
          </div>
        </div>

        {filtering ? (
          <div className="filter-chip-row">
            <button className="filter-chip" type="button" onClick={() => setFilterOpen(true)}>
              מסונן · {accounts.filter((a) => hiddenAccounts.has(a.key)).length} מוסתרים
            </button>
            <button className="filter-chip-clear" type="button" onClick={() => applyHidden(new Set())}>
              הצגת הכול
            </button>
          </div>
        ) : null}

        <div className="section">
          <HeroCard
            greeting={data.greeting}
            monthName={monthName}
            forecast={shown.forecast}
            variableRemaining={shown.variableRemaining}
          />
        </div>

        <div className="section">
          {data.envelopes.length === 0 && data.wallet.movements.length === 0 ? (
            <EmptyState />
          ) : (
            <EnvelopeList
              envelopes={shown.envelopes}
              plans={data.plans}
              envelopeChoices={data.envelopeChoices}
              savingsEnvelopeId={data.savingsEnvelopeId}
              wallet={data.wallet}
              members={data.members}
              months={data.months}
              sessionMemberId={sessionMemberId}
              month={data.month}
              today={today}
              totalActualExpenses={shown.totalActualExpenses}
              totalExpectedExpenses={data.totalExpectedExpenses}
              expandAll={expandAll}
            />
          )}
        </div>
      </div>

      <DailyBriefBlob count={data.briefCount} />

      {filterOpen ? (
        <AccountFilterSheet
          accounts={accounts}
          hidden={hiddenAccounts}
          onApply={applyHidden}
          onClose={() => setFilterOpen(false)}
        />
      ) : null}

      {search ? (
        <SearchSheet
          envelopes={data.envelopeChoices}
          months={data.months}
          members={data.members}
          wallets={data.wallet.wallets}
          sessionMemberId={sessionMemberId}
          onClose={() => setSearch(false)}
        />
      ) : null}
    </Shell>
  );
}

const HIDDEN_ACCOUNTS_KEY = 'our-money:hidden-accounts';

function EmptyState() {
  return (
    <article className="card">
      <div className="card-body notice">
        <h1>עוד אין נתונים לחודש הזה</h1>
        <p>
          הריצו <strong>/sync</strong> בבוט כדי למשוך את התזרים מרייזאפ.
        </p>
      </div>
    </article>
  );
}
