import { DailyBriefBlob } from '@/app/dashboard/components/Blob';
import { EnvelopeList } from '@/app/dashboard/components/EnvelopeList';
import { HeroCard } from '@/app/dashboard/components/HeroCard';
import { Shell } from '@/app/dashboard/components/Shell';
import { ChevronLeft, Clover } from '@/app/dashboard/components/icons';
import type { DashboardData } from '@/lib/dashboard/data';
import { isoDateInIsrael } from '@/lib/intake/parse';
import { monthLabel } from '@/lib/money';

/**
 * The whole dashboard as a pure function of its data, so
 * `scripts/preview-dashboard.tsx` can render the real thing against fixtures.
 */
export function DashboardView({
  data,
  expandAll = false,
}: {
  data: DashboardData;
  /** Preview-only: renders every breakdown open so it can be screenshotted. */
  expandAll?: boolean;
}) {
  const today = isoDateInIsrael();
  const monthName = monthLabel(data.month).split(' ')[0] ?? data.month;

  return (
    <Shell
      month={data.month}
      months={data.months}
      userName={data.userName}
      lastUpdated={data.lastUpdated}
      briefCount={data.briefCount}
    >
      <div className="app">
        <div className="steps-section">
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
          {data.envelopes.length === 0 ? (
            <EmptyState />
          ) : (
            <EnvelopeList
              envelopes={data.envelopes}
              month={data.month}
              today={today}
              totalActualExpenses={data.totalActualExpenses}
              totalExpectedExpenses={data.totalExpectedExpenses}
              expandAll={expandAll}
            />
          )}
        </div>
      </div>

      <DailyBriefBlob count={data.briefCount} />
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
