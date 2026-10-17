import type { EnvelopeView } from '@/lib/dashboard/data';
import { formatIls, monthParts } from '@/lib/money';
import { escapeHtml } from '@/lib/telegram/client';

/**
 * The Sunday-morning summary in Telegram (C24), in the spirit of RiseUp's
 * WhatsApp updates ("תזרים צפוי לאוקטובר", "מעבר על התזרים"). Pure: the cron
 * (weekly-summary-send.ts) loads the same figures the dashboard shows and
 * hands them here, so the message and the app never disagree.
 */

export interface SummaryWeek {
  /** The Sunday the summary belongs to; it is sent once per key. */
  key: string;
  /** Sunday to Saturday before it. */
  from: string;
  to: string;
}

const DAY_MS = 86_400_000;

function shiftDate(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The week before the latest Sunday on or before this (Israel) date. */
export function summaryWeek(today: string): SummaryWeek {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const key = shiftDate(today, -weekday);
  return { key, from: shiftDate(key, -7), to: shiftDate(key, -1) };
}

/** What counts as spending: not income, and not money put aside in savings. */
const SPENDING_TYPES = new Set<EnvelopeView['type']>(['variable', 'fixed', 'trackingCategory']);

export interface WeekSpending {
  total: number;
  /** The part of it paid in cash. */
  cash: number;
  /** The three envelopes it went to most, biggest first. */
  top: Array<{ title: string; amount: number }>;
}

/**
 * Spending dated in the week, RiseUp charges and cash together. A week that
 * started in the month before passes that month's envelopes too.
 */
export function weekSpending(
  envelopes: EnvelopeView[],
  week: Pick<SummaryWeek, 'from' | 'to'>,
  previousEnvelopes: EnvelopeView[] = [],
): WeekSpending {
  const byTitle = new Map<string, number>();
  let total = 0;
  let cash = 0;
  for (const envelope of [...previousEnvelopes, ...envelopes]) {
    if (!SPENDING_TYPES.has(envelope.type)) continue;
    for (const a of envelope.actuals) {
      if (a.isIncome || !a.transactionDate) continue;
      if (a.transactionDate < week.from || a.transactionDate > week.to) continue;
      total += a.amountIls;
      if (a.cash) cash += a.amountIls;
      byTitle.set(envelope.title, (byTitle.get(envelope.title) ?? 0) + a.amountIls);
    }
  }
  const top = [...byTitle.entries()]
    .map(([title, amount]) => ({ title, amount: round(amount) }))
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  return { total: round(total), cash: round(cash), top };
}

export interface TrackerAlert {
  title: string;
  /** over: spent more than the target; fast: on the way there. */
  kind: 'over' | 'fast';
  actual: number;
  planned: number;
  expected: number;
}

/** Ahead of the calendar by this share of the target counts as fast… */
const FAST_LEAD = 0.15;
/** …once at least this much of the target is gone (day one is not a trend). */
const FAST_FLOOR = 0.3;

/**
 * Trackers (RiseUp's "מעקב" envelopes) worth a look this month: over their
 * target, or running fast — RiseUp already expects more than the target (a
 * weekly tracker whose past weeks overspent), or more of it is gone than of
 * the month. Worst first.
 */
export function trackerAlerts(envelopes: EnvelopeView[], today: string): TrackerAlert[] {
  const [year, month, day] = today.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  const elapsed = day! / daysInMonth;

  const alerts: Array<TrackerAlert & { share: number }> = [];
  for (const e of envelopes) {
    if (e.type !== 'trackingCategory') continue;
    const planned = e.planned ?? 0;
    if (planned <= 0) continue;
    const share = e.actual / planned;
    const base = { title: e.title, actual: round(e.actual), planned: round(planned), expected: round(e.expected), share };
    if (e.actual > planned) alerts.push({ ...base, kind: 'over' });
    else if (e.expected > planned || (share >= elapsed + FAST_LEAD && share >= FAST_FLOOR)) alerts.push({ ...base, kind: 'fast' });
  }
  return alerts
    .sort((a, b) => (a.kind === b.kind ? b.share - a.share : a.kind === 'over' ? -1 : 1))
    .map(({ share: _share, ...alert }) => alert);
}

export interface WeeklySummaryInput {
  /** Israel date it is sent on. */
  today: string;
  /** The month the trackers and the forecast are for (today's). */
  month: string;
  week: SummaryWeek;
  envelopes: EnvelopeView[];
  /** The month before, when last week started in it. */
  previousEnvelopes?: EnvelopeView[];
  /** All the cash in every wallet, as the dashboard's wallet card says. */
  walletBalance: number;
  /** The dashboard's headline: income minus every expected expense. */
  forecast: number;
  /** Who it greets (the names they chose). */
  names: string[];
  dashboardUrl: string;
}

const MAX_TRACKER_LINES = 3;

function ils(amount: number): string {
  return formatIls(Math.round(amount));
}

function shortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${Number(day)}.${Number(month)}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** One short message in plain Hebrew. HTML parse mode: names and titles are escaped. */
export function composeWeeklySummary(input: WeeklySummaryInput): string {
  const lines: string[] = [];
  const names = input.names.map((n) => escapeHtml(firstName(n))).filter(Boolean);
  const hello = names.length > 0 ? `☀️ בוקר טוב, ${names.join(' ו')}!` : '☀️ בוקר טוב!';
  lines.push(`${hello} הסיכום השבועי (${shortDate(input.week.from)}–${shortDate(input.week.to)})`);
  lines.push('');

  const spending = weekSpending(input.envelopes, input.week, input.previousEnvelopes);
  if (spending.total > 0) {
    lines.push(`💳 בשבוע שעבר הוצאתם <b>${ils(spending.total)}</b>${spending.cash > 0 ? ` (מזה ${ils(spending.cash)} במזומן)` : ''}.`);
    lines.push(`הכי הרבה: ${spending.top.map((t) => `${escapeHtml(t.title)} ${ils(t.amount)}`).join(' · ')}`);
  } else {
    lines.push('💳 בשבוע שעבר לא נרשמו הוצאות.');
  }

  const alerts = trackerAlerts(input.envelopes, input.today);
  if (alerts.length > 0) {
    lines.push('');
    lines.push('👀 מעקבים ששווה להציץ בהם:');
    for (const alert of alerts.slice(0, MAX_TRACKER_LINES)) {
      const title = escapeHtml(alert.title);
      if (alert.kind === 'over') {
        lines.push(`🔴 ${title}: ${ils(alert.actual)} מתוך ${ils(alert.planned)} — עברתם את היעד ב-${ils(alert.actual - alert.planned)}`);
      } else if (alert.expected > alert.planned) {
        lines.push(`🟠 ${title}: ${ils(alert.actual)} מתוך ${ils(alert.planned)} — בקצב הזה צפוי ${ils(alert.expected)}`);
      } else {
        lines.push(`🟠 ${title}: ${ils(alert.actual)} מתוך ${ils(alert.planned)} — כבר ${Math.round((alert.actual / alert.planned) * 100)}% מהיעד`);
      }
    }
    if (alerts.length > MAX_TRACKER_LINES) lines.push(`ועוד ${alerts.length - MAX_TRACKER_LINES} בדאשבורד.`);
  }

  if (input.walletBalance !== 0 || spending.cash > 0) {
    lines.push('');
    lines.push(`💵 בארנקים: ${ils(input.walletBalance)}. במזומן יצאו בשבוע שעבר ${ils(spending.cash)}.`);
  }

  lines.push('');
  const monthName = monthParts(input.month).name;
  const forecast = Math.round(input.forecast);
  const ending =
    forecast > 0 ? `בפלוס של <b>${ils(forecast)}</b>` : forecast < 0 ? `במינוס של <b>${ils(-forecast)}</b>` : 'מאוזן, בלי פלוס ובלי מינוס';
  lines.push(`📈 התזרים של ${monthName} צפוי להסתיים ${ending}.`);
  lines.push('');
  lines.push(`לכל הפרטים: ${input.dashboardUrl}`);
  return lines.join('\n');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
