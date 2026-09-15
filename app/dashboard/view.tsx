import { isoDateInIsrael } from '@/lib/intake/parse';
import { isUnloggedRow } from '@/lib/dashboard/data';
import type { DashboardData } from '@/lib/dashboard/data';
import { formatIls, formatIlsCompact, friendlyDate, monthLabel } from '@/lib/money';
import {
  CategoryRow,
  CompositionBar,
  Legend,
  SERIES_COLOR,
  StatTile,
  TableView,
  type Series,
} from '@/app/dashboard/components';

/**
 * The entire dashboard, as a pure function of its data. Keeping it free of
 * cookies and queries is what lets `scripts/preview-dashboard.tsx` render the
 * real thing against fixtures instead of a mock-up that can drift from it.
 */
export function DashboardView({ data }: { data: DashboardData }) {
  const month = data.month;
  const today = isoDateInIsrael();

  const series: Series[] = [
    { key: 'bank', label: 'כרטיס ובנק', color: SERIES_COLOR.bank, value: data.bankSpending },
    { key: 'cash', label: 'מזומן שנרשם', color: SERIES_COLOR.cash, value: data.cashLogged },
    {
      key: 'unlogged',
      label: 'מזומן שטרם נרשם',
      color: SERIES_COLOR.unlogged,
      value: data.unloggedThisMonth,
    },
  ];

  const maxCategory = data.categories[0]?.total ?? 0;
  const wallet = data.walletNow;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="wordmark">
          <span className="dot">₪</span>
          Our Money
        </div>
        <nav className="months" aria-label="בחירת חודש">
          {data.availableMonths.map((option) => (
            <a
              key={option}
              className="month-chip"
              href={`/dashboard?month=${option}`}
              aria-current={option === month ? 'page' : undefined}
            >
              {monthLabel(option)}
            </a>
          ))}
        </nav>
      </header>

      {/* The one hero figure on the view. */}
      <section className="card hero">
        <p className="label">{data.net >= 0 ? 'נשאר לכם בתזרים' : 'חריגה מהתזרים'}</p>
        <p className="figure">{formatIls(Math.abs(data.net))}</p>
        <p className="note">
          {monthLabel(month)} · הכנסות {formatIlsCompact(data.income)} · הוצאות{' '}
          {formatIlsCompact(data.totalSpending)}
        </p>
      </section>

      <div className="tiles">
        <StatTile
          label="נמשך החודש"
          value={formatIlsCompact(data.withdrawnThisMonth)}
          note="מזומן מהבנק"
        />
        <StatTile label="נרשם במזומן" value={formatIlsCompact(data.cashLogged)} />
        <StatTile
          label="בארנק עכשיו"
          value={formatIlsCompact(wallet.unaccounted)}
          note={wallet.unaccounted === 0 ? 'מאוזן' : 'מצטבר, כל החודשים'}
          state={wallet.unaccounted === 0 ? 'good' : 'warning'}
          wide
        />
      </div>

      <section className="card">
        <h2>לאן הלך הכסף</h2>
        <p className="sub">
          משיכות מהכספומט לא נספרות כהוצאה — הן מופיעות כאן לפי מה שבאמת נקנה בהן.
        </p>
        <Legend series={series} />
        <CompositionBar series={series} total={data.totalSpending} />
        <TableView
          caption="הצגה כטבלה"
          head={['מקור', 'סכום']}
          rows={series.map((item) => [item.label, formatIls(item.value)])}
        />
      </section>

      <section className="card">
        <h2>קטגוריות</h2>
        <p className="sub">כרטיס ומזומן יחד, {monthLabel(month)}</p>
        {data.categories.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>
            אין עדיין נתונים לחודש הזה.
          </p>
        ) : (
          <>
            <div className="rows">
              {data.categories.map((row) => (
                <CategoryRow
                  key={row.label}
                  label={row.label}
                  bank={row.bank}
                  cash={row.cash}
                  total={row.total}
                  max={maxCategory}
                  flagged={isUnloggedRow(row.label)}
                />
              ))}
            </div>
            <TableView
              caption="הצגה כטבלה"
              head={['קטגוריה', 'כרטיס', 'מזומן', 'סה״כ']}
              rows={data.categories.map((row) => [
                row.label,
                formatIls(row.bank),
                formatIls(row.cash),
                formatIls(row.total),
              ])}
            />
          </>
        )}
      </section>

      <section className="card">
        <h2>מזומן אחרון</h2>
        <p className="sub">מה שנרשם בבוט</p>
        {data.recentCash.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>
            עוד לא נרשמו הוצאות מזומן החודש.
          </p>
        ) : (
          <ul className="activity">
            {data.recentCash.map((item) => (
              <li key={item.id}>
                <span className="icon" aria-hidden="true">
                  {item.inputKind === 'voice' ? '🎤' : '₪'}
                </span>
                <span className="body">
                  <span className="title">
                    {item.note || item.category}
                    {item.status === 'needs_review' ? <span className="pill">לאישור</span> : null}
                  </span>
                  <span className="meta">
                    {item.category} · {item.memberName} · {friendlyDate(item.spentAt, today)}
                  </span>
                </span>
                <span className="amount">{formatIls(item.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="footnote">
        {data.lastSyncAt
          ? `סונכרן לאחרונה מרייזאפ ב-${new Date(data.lastSyncAt).toLocaleString('he-IL', {
              timeZone: 'Asia/Jerusalem',
              dateStyle: 'short',
              timeStyle: 'short',
            })}`
          : 'עוד לא בוצע סנכרון מרייזאפ'}
      </p>
    </div>
  );
}
