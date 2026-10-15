'use client';

import { useEffect, useState } from 'react';

import { AccountFilterSheet } from '@/app/dashboard/components/AccountFilterSheet';
import { DailyBrief } from '@/app/dashboard/components/DailyBrief';
import { EnvelopeList } from '@/app/dashboard/components/EnvelopeList';
import { ForecastSheet } from '@/app/dashboard/components/ForecastSheet';
import { HeroCard } from '@/app/dashboard/components/HeroCard';
import { InsightCards } from '@/app/dashboard/components/InsightCards';
import { RefreshButton } from '@/app/dashboard/components/RefreshButton';
import { SearchSheet } from '@/app/dashboard/components/SearchSheet';
import { SetupStepsBanner } from '@/app/dashboard/components/SetupSteps';
import { Shell } from '@/app/dashboard/components/Shell';
import { WalletsSheet } from '@/app/dashboard/components/WalletsSheet';
import { filterDashboard, listAccounts, parseHidden } from '@/lib/dashboard/account-filter';
import { EMPTY_BRIEF, type BriefData } from '@/lib/dashboard/brief';
import type { DashboardData } from '@/lib/dashboard/data';
import { forecastBreakdown } from '@/lib/dashboard/forecast-breakdown';
import type { Insight } from '@/lib/dashboard/insights';
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
  brief = EMPTY_BRIEF,
  insights = [],
  briefStep,
  insightOpenKey,
  previewHiddenAccounts,
}: {
  data: DashboardData;
  /** The daily brief for whoever is signed in; null when they turned it off in Settings. */
  brief?: BriefData | null;
  /** Insight cards for the current month. */
  insights?: Insight[];
  /** Preview-only: the brief deck open at this card. */
  briefStep?: number;
  /** Preview-only: this insight's popup open. */
  insightOpenKey?: string;
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
  const [walletsOpen, setWalletsOpen] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);
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
      briefCount={brief ? data.briefCount : null}
      onSearch={() => setSearch(true)}
      onFilter={() => setFilterOpen(true)}
      onOpenWallets={() => setWalletsOpen(true)}
    >
      <div className="app">
        <InsightCards insights={insights} initialOpenKey={insightOpenKey} />
        <div className="steps-section">
          {data.syncBanner && (
            <div className={`sync-banner ${data.syncBanner.tone}`} role="status">
              <span>{data.syncBanner.text}</span>
              <RefreshButton />
            </div>
          )}
          <SetupStepsBanner steps={data.setupSteps} preferredName={data.preferredName} />
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
            onExplain={() => setForecastOpen(true)}
          />
          <ForecastSheet
            open={forecastOpen}
            onClose={() => setForecastOpen(false)}
            monthName={monthName}
            breakdown={forecastBreakdown(data.envelopes)}
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

      {brief ? (
        <DailyBrief
          brief={brief}
          envelopes={data.envelopeChoices}
          members={data.members}
          wallets={data.wallet.wallets}
          sessionMemberId={sessionMemberId}
          initialStep={briefStep}
        />
      ) : null}

      {walletsOpen ? (
        <WalletsSheet
          wallets={data.wallet.wallets}
          members={data.members}
          movements={data.wallet.movements}
          onClose={() => setWalletsOpen(false)}
        />
      ) : null}

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
