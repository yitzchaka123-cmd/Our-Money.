/**
 * The way in, for every page: the bot's link for a browser, or the code from
 * the same message for the home-screen app (which keeps its own cookies and
 * so never sees the link's). A plain form post, so it works without scripts.
 */
export function SignedOut({ login }: { login?: string | null }) {
  const problem =
    login === 'wrong'
      ? 'הקוד לא נכון או שפג תוקפו. שלחו שוב /dashboard לבוט לקוד חדש.'
      : login === 'locked'
        ? 'היו יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.'
        : null;

  return (
    <div className="app">
      <div className="section">
        <article className="card">
          <div className="card-body notice signed-out">
            <img src="/icons/icon-192.png" alt="" width={56} height={56} className="signed-out-icon" />
            <h1>כניסה למזומן שלנו</h1>
            <p>
              שלחו <strong>/dashboard</strong> לבוט בטלגרם. בהודעה יש קישור וקוד בן שש ספרות.
            </p>
            <p>אם פתחתם מהאפליקציה שעל מסך הבית — הקלידו כאן את הקוד:</p>

            <form method="post" action="/api/auth/code" className="code-form">
              <input
                name="code"
                className="code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="••••••"
                aria-label="קוד כניסה"
                required
              />
              <button className="btn" type="submit">
                כניסה
              </button>
            </form>
            {problem ? <p className="form-error">{problem}</p> : null}
          </div>
        </article>
      </div>
    </div>
  );
}
