import { db } from '@/lib/db/client';
import { env } from '@/lib/env';
import { ensureWebhook, getMe } from '@/lib/telegram/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

/** Every variable the app cannot run without, and where it comes from. */
const REQUIRED_VARS: Array<[name: string, where: string]> = [
  ['TELEGRAM_BOT_TOKEN', 'BotFather'],
  ['TELEGRAM_ALLOWED_USER_IDS', 'המזהים שלכם בטלגרם, מופרדים בפסיק'],
  ['ANTHROPIC_API_KEY', 'console.anthropic.com'],
  ['OPENAI_API_KEY', 'platform.openai.com'],
  ['RISEUP_PAT', 'input.riseup.co.il/developer/tokens'],
  ['SUPABASE_URL', 'כתובת פרויקט Supabase'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'המפתח הסודי של Supabase'],
  ['APP_SESSION_SECRET', 'מחרוזת אקראית ארוכה'],
  ['CRON_SECRET', 'מחרוזת אקראית ארוכה'],
];

async function checkDatabase(): Promise<Check> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { label: 'מסד הנתונים', ok: false, detail: 'חסרים SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY.' };
  }
  try {
    // login_codes comes from the newest migration that adds a table; if it
    // answers, every migration before it ran too.
    const { error } = await db().from('login_codes').select('id', { count: 'exact', head: true });
    if (error) return { label: 'מסד הנתונים', ok: false, detail: `החיבור נכשל או שהטבלאות חסרות: ${error.message}` };
    return { label: 'מסד הנתונים', ok: true, detail: 'מחובר, כל הטבלאות קיימות.' };
  } catch (error) {
    return { label: 'מסד הנתונים', ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function checkTelegram(): Promise<Check[]> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.APP_SESSION_SECRET) {
    return [{ label: 'בוט הטלגרם', ok: false, detail: 'חסרים TELEGRAM_BOT_TOKEN או APP_SESSION_SECRET.' }];
  }
  try {
    const bot = await getMe();
    const { changed, info } = await ensureWebhook(true);
    return [
      { label: 'בוט הטלגרם', ok: true, detail: bot.username ? `@${bot.username} — https://t.me/${bot.username}` : bot.first_name },
      {
        label: 'חיבור הבוט לאפליקציה (webhook)',
        ok: info.url.length > 0,
        detail: `${changed ? 'נרשם עכשיו' : 'רשום'}: ${info.url}${info.pending_update_count ? ` · ${info.pending_update_count} הודעות ממתינות` : ''}`,
      },
    ];
  } catch (error) {
    return [{ label: 'בוט הטלגרם', ok: false, detail: `הטוקן לא עובד: ${error instanceof Error ? error.message : String(error)}` }];
  }
}

async function checkRiseup(): Promise<Check> {
  if (!process.env.RISEUP_PAT) return { label: 'RiseUp', ok: false, detail: 'חסר RISEUP_PAT.' };
  try {
    const { data } = await db()
      .from('sync_runs')
      .select('status, error, finished_at')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return { label: 'RiseUp', ok: true, detail: 'עוד לא סונכרן — זה יקרה בפעם הראשונה שתפתחו את הדאשבורד.' };
    if (data.status === 'failed') return { label: 'RiseUp', ok: false, detail: `הסנכרון האחרון נכשל: ${data.error as string}` };
    return { label: 'RiseUp', ok: true, detail: `סונכרן לאחרונה: ${(data.finished_at as string | null) ?? 'רץ עכשיו'}` };
  } catch {
    return { label: 'RiseUp', ok: false, detail: 'אי אפשר לבדוק לפני שמסד הנתונים מחובר.' };
  }
}

/**
 * One page that says whether the deployment is wired up, and registers the
 * Telegram webhook as a side effect — so going live is "set the variables,
 * deploy, open /setup". It shows which variables are present, never values.
 */
export default async function SetupPage() {
  const vars: Check[] = REQUIRED_VARS.map(([name, where]) => ({
    label: name,
    ok: Boolean(process.env[name]),
    detail: process.env[name] ? undefined : `חסר — ${where}`,
  }));

  let baseUrl: Check;
  try {
    baseUrl = { label: 'כתובת האפליקציה', ok: true, detail: env.appBaseUrl };
  } catch {
    baseUrl = { label: 'כתובת האפליקציה', ok: false, detail: 'הגדירו APP_BASE_URL.' };
  }

  const [database, telegram, riseup] = await Promise.all([checkDatabase(), checkTelegram(), checkRiseup()]);
  const allowed = env.allowedTelegramUserIds.length;
  const checks = [
    database,
    ...telegram,
    riseup,
    baseUrl,
    { label: 'משתמשים מורשים', ok: allowed > 0, detail: allowed > 0 ? `${allowed} מזהים ברשימה` : 'TELEGRAM_ALLOWED_USER_IDS ריק — הבוט ידחה את כולם.' },
  ];
  const ready = [...vars, ...checks].every((c) => c.ok);

  return (
    <div className="app">
      <h1 className="page-title">בדיקת הגדרות</h1>
      <div className="section">
        <article className="card">
          <div className="card-body">
            <p className="setup-verdict" data-ok={ready}>
              {ready ? '✅ הכול מוכן. שלחו /start לבוט ואז /dashboard.' : '⚠️ חסרים כמה דברים — הפרטים למטה.'}
            </p>
            <ul className="setup-list">
              {checks.map((check) => (
                <li key={check.label} data-ok={check.ok}>
                  <span className="setup-mark" aria-hidden="true">{check.ok ? '✅' : '❌'}</span>
                  <span>
                    <strong>{check.label}</strong>
                    {check.detail ? <span className="setup-detail">{check.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <h2 className="setup-subtitle">משתני סביבה ב-Vercel</h2>
            <ul className="setup-list">
              {vars.map((check) => (
                <li key={check.label} data-ok={check.ok}>
                  <span className="setup-mark" aria-hidden="true">{check.ok ? '✅' : '❌'}</span>
                  <span>
                    <code dir="ltr">{check.label}</code>
                    {check.detail ? <span className="setup-detail">{check.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </div>
    </div>
  );
}
