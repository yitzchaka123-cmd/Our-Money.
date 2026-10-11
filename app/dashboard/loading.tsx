/**
 * What shows while the dashboard loads (opening it may pull from RiseUp
 * first): RiseUp's grey placeholder cards — the app bar, the month bar, the
 * forecast card and two envelope cards — with a soft shimmer, instead of a
 * blank screen. Plain CSS, no script.
 */
export default function DashboardLoading() {
  return (
    <div className="skel" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">טוען את התזרים…</span>

      <div className="appbar skel-appbar" aria-hidden="true">
        <span className="skel-icons">
          <span className="skel-dot" />
          <span className="skel-dot" />
          <span className="skel-dot" />
        </span>
        <span className="skel-dot" />
      </div>
      <div className="skel-monthbar" aria-hidden="true">
        <span className="skel-line" style={{ width: 120 }} />
      </div>

      <div className="app" aria-hidden="true">
        <div className="section skel-top">
          <span className="skel-line skel-line--banner" />
        </div>
        <div className="section">
          <article className="card skel-card skel-card--hero">
            <span className="skel-line" style={{ width: '28%' }} />
            <span className="skel-line skel-line--title" style={{ width: '72%' }} />
            <span className="skel-line skel-line--figure" />
            <span className="skel-line skel-line--pill" />
          </article>
          {[0, 1].map((i) => (
            <article key={i} className="card skel-card">
              <span className="skel-line skel-line--title" style={{ width: '58%' }} />
              <span className="skel-line" style={{ width: '86%' }} />
              <span className="skel-line skel-line--bar" />
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
