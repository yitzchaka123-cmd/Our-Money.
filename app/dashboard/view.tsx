'use client';

import { useState } from 'react';

import { DailyBrief } from '@/app/dashboard/components/DailyBrief';
import { EnvelopeList } from '@/app/dashboard/components/EnvelopeList';
import { HeroCard } from '@/app/dashboard/components/HeroCard';
import { InsightCards } from '@/app/dashboard/components/InsightCards';
import { RefreshButton } from '@/app/dashboard/components/RefreshButton';
import { SearchSheet } from '@/app/dashboard/components/SearchSheet';
import { Shell } from '@/app/dashboard/components/Shell';
import { ChevronLeft, Clover } from '@/app/dashboard/components/icons';
import { EMPTY_BRIEF, type BriefData } from '@/lib/dashboard/brief';
import type { DashboardData } from '@/lib/dashboard/data';
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
}: {
  data: DashboardData;
  /** The daily brief for whoever is signed in. */
  brief?: BriefData;
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
}) {
  const today = isoDateInIsrael();
  const monthName = monthLabel(data.month).split(' ')[0] ?? data.month;
  const [search, setSearch] = useState<'search' | 'filter' | null>(null);

  return (
    <Shell
      month={data.month}
      months={data.months}
      userName={data.userName}
      lastUpdated={data.lastUpdated}
      briefCount={data.briefCount}
      onSearch={() => setSearch('search')}
      onFilter={() => setSearch('filter')}
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

        <div className="section">
          <HeroCard
            greeting={data.greeting}
            monthName={monthName}
            forecast={data.forecast}
            variableRemaining={data.variableRemaining}
          />
        </div>

        <div className="section">
          {data.envelopes.length === 0 && data.wallet.movements.length === 0 ? (
            <EmptyState />
          ) : (
            <EnvelopeList
              envelopes={data.envelopes}
              plans={data.plans}
              envelopeChoices={data.envelopeChoices}
              savingsEnvelopeId={data.savingsEnvelopeId}
              wallet={data.wallet}
              members={data.members}
              months={data.months}
              sessionMemberId={sessionMemberId}
              month={data.month}
              today={today}
              totalActualExpenses={data.totalActualExpenses}
              totalExpectedExpenses={data.totalExpectedExpenses}
              expandAll={expandAll}
            />
          )}
        </div>
      </div>

      <DailyBrief
        brief={brief}
        envelopes={data.envelopeChoices}
        members={data.members}
        wallets={data.wallet.wallets}
        sessionMemberId={sessionMemberId}
        initialStep={briefStep}
      />

      {search ? (
        <SearchSheet
          month={data.month}
          focus={search}
          envelopes={data.envelopeChoices}
          members={data.members}
          wallets={data.wallet.wallets}
          sessionMemberId={sessionMemberId}
          onClose={() => setSearch(null)}
        />
      ) : null}
    </Shell>
  );
}

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
