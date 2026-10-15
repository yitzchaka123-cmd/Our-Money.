/**
 * Insight cards: the row of short notes RiseUp shows at the top of the page,
 * built here only from the couple's own numbers. Each rule either has
 * something true and worth saying, or returns nothing.
 *
 * Pure: the loader (insights-load.ts) gathers the figures. Safe to import from
 * client components.
 */

import { median, type RichText } from '@/lib/dashboard/brief';
import type { EnvelopeView } from '@/lib/dashboard/data';
import { isoDateInIsrael } from '@/lib/dates';
import { monthLabel } from '@/lib/money';

export type InsightKind = 'forecast' | 'big-charge' | 'tracker-over' | 'tracker-pace' | 'income' | 'cash-low';

/** Which drawing sits in the card's top band. */
export type InsightArt = 'chart-down' | 'chart-up' | 'coins' | 'bars' | 'income' | 'wallet';

export interface Insight {
  /** Stable for the thing it is about, so a dismissal sticks to it. */
  key: string;
  kind: InsightKind;
  art: InsightArt;
  /** The bold opening of the card. */
  title: string;
  /** The rest of the card, after the title. */
  body: RichText;
  detail: {
    heading: string;
    paragraphs: RichText[];
    /** Under "מה עכשיו?". */
    next: RichText;
  };
  /** The "זה עזר לך?" answer, if already given. */
  helpful: boolean | null;
}

export interface InsightInput {
  /** Israel date, YYYY-MM-DD. */
  today: string;
  /** The month the figures are for — the current one. */
  month: string;
  /** This month's envelopes, as the dashboard shows them. */
  envelopes: EnvelopeView[];
  /** Each tracker's RiseUp target and what has gone out (cash included). */
  trackers: Array<{ name: string; planned: number; actual: number }>;
  forecast: number;
  /** Yesterday's stored forecast for the same month, if there is one. */
  yesterdayForecast: number | null;
  wallet: { balance: number; wallets: Array<{ name: string; balance: number }> };
  /** Every expense of the last three months, for what "a usual one" is. */
  baselineExpenses: number[];
}

/**
 * What a member has done with each card, by key. `seenAt` is when it was
 * first shown and `openedAt` when "לפרטים נוספים" was tapped (migration 0012;
 * both absent before it is applied).
 */
export type InsightFeedback = Map<
  string,
  { dismissed: boolean; helpful: boolean | null; seenAt?: string | null; openedAt?: string | null }
>;

const MAX_CARDS = 6;

// ---------------------------------------------------------------------------

/**
 * A card's key moves on only when its numbers move materially: `value` in
 * steps of `size`. The first step keeps the plain key, so a small overrun
 * dismissed before keys had steps stays dismissed.
 */
function steppedKey(base: string, value: number, size: number): string {
  const level = size > 0 ? Math.floor(Math.max(value, 0) / size) : 0;
  return level > 0 ? `${base}:${level + 1}` : base;
}

/**
 * Shown once: a card is shown on the day it first appears and never after,
 * and never again once opened, answered or dismissed. Only a new key — the
 * numbers moved materially — makes a new card.
 */
export function stillShowable(key: string, feedback: InsightFeedback, today: string): boolean {
  const seen = feedback.get(key);
  if (!seen) return true;
  if (seen.dismissed || seen.openedAt || seen.helpful !== null) return false;
  return !seen.seenAt || isoDateInIsrael(new Date(seen.seenAt)) >= today;
}

/** The cards on screen that have no "first shown" mark yet. */
export function keysToMarkSeen(shown: Array<{ key: string }>, feedback: InsightFeedback): string[] {
  return shown.map((c) => c.key).filter((key) => !feedback.get(key)?.seenAt);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Sunday a calendar week starts on (RiseUp's weeks run Sunday to Saturday). */
export function weekStart(iso: string): string {
  const weekday = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return addDays(iso, -weekday);
}

function daysInMonth(month: string): number {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year!, m!, 0)).getUTCDate();
}

/** RiseUp writes dates as d.m.yy. */
function dmy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}.${y!.slice(2)}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

const sum = (values: number[]) => round(values.reduce((s, v) => s + v, 0));

const EXPENSE_CANDIDATES = new Set<EnvelopeView['type']>(['variable', 'trackingCategory']);
const INCOME_TYPES = new Set<EnvelopeView['type']>(['variableIncome', 'cashIncome']);

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

const BIG_MIN_ILS = 400;
const BIG_TIMES_USUAL = 3;
const BASELINE_MIN_COUNT = 5;

/** The biggest variable charge this week, when it dwarfs a usual one. */
export function bigChargeInsight(input: InsightInput): Insight | null {
  if (input.baselineExpenses.length < BASELINE_MIN_COUNT) return null;
  const usual = round(median(input.baselineExpenses.map(Math.abs)));
  if (usual <= 0) return null;

  const from = weekStart(input.today);
  const candidates = input.envelopes
    .filter((e) => EXPENSE_CANDIDATES.has(e.type))
    .flatMap((e) => e.actuals)
    .filter((a) => !a.isIncome && a.transactionDate && a.transactionDate >= from && a.transactionDate <= input.today)
    .filter((a) => a.amountIls >= BIG_MIN_ILS && a.amountIls >= usual * BIG_TIMES_USUAL)
    .sort((a, b) => b.amountIls - a.amountIls);

  const top = candidates[0];
  if (!top) return null;
  const times = Math.floor(top.amountIls / usual);
  const where = top.businessName || top.categoryLabel || '';

  return {
    key: `big-charge:${top.transactionId}`,
    kind: 'big-charge',
    art: 'coins',
    title: 'הוצאה גדולה השבוע:',
    body: [{ amount: top.amountIls }, ` ב-${where}, בערך פי ${times} מהוצאה רגילה אצלכם.`],
    detail: {
      heading: 'הוצאה גדולה השבוע',
      paragraphs: [
        [`ב-${dmy(top.transactionDate!)} יצאו `, { amount: top.amountIls }, ` ב-${where}${top.cash ? ' (במזומן)' : ''}.`],
        ['הוצאה רגילה אצלכם בשלושת החודשים האחרונים היא בסביבות ', { amount: usual }, `, כך שזו הוצאה גדולה בערך פי ${times}.`],
      ],
      next: ['אם זו הוצאה שתכננתם — הכול בסדר. אם לא, כדאי לוודא שהיא באמת שלכם ושהיא רשומה בקטגוריה הנכונה.'],
    },
    helpful: null,
  };
}

/** A tracker is "fast" when it is this far ahead of the month… */
const PACE_TIMES = 1.25;
/** …by at least this much… */
const PACE_MIN_ILS = 50;
/** …and there is still enough month left for it to matter. */
const PACE_UNTIL_SHARE = 0.9;

/** An over-target card comes back when it is this share of the target further over… */
const OVER_STEP_SHARE = 0.25;
/** …and at least this much. */
const OVER_STEP_MIN_ILS = 100;

/** Trackers over their target, or running well ahead of the month. */
export function trackerInsights(input: InsightInput): Insight[] {
  const day = Number(input.today.slice(8, 10));
  const total = daysInMonth(input.month);
  const share = day / total;
  const daysLeft = total - day;

  return input.trackers.flatMap((t): Insight[] => {
    if (t.planned <= 0) return [];
    const name = t.name;

    if (t.actual > t.planned) {
      const over = round(t.actual - t.planned);
      return [
        {
          // A new card each further quarter of the target over (at least 100 ₪).
          key: steppedKey(`tracker-over:${input.month}:${name}`, over, Math.max(OVER_STEP_MIN_ILS, t.planned * OVER_STEP_SHARE)),
          kind: 'tracker-over',
          art: 'bars',
          title: `${name}: עברתם את היעד החודשי.`,
          body: ['יצאו ', { amount: t.actual }, ' מתוך יעד של ', { amount: t.planned }, ' — ', { amount: over }, ' מעל.'],
          detail: {
            heading: `${name} מעל היעד`,
            paragraphs: [
              [`החודש יצאו על ${name} `, { amount: t.actual }, ', והיעד החודשי הוא ', { amount: t.planned }, '.'],
              ['כלומר ', { amount: over }, ` מעל היעד, ועוד ${daysLeft} ימים עד סוף החודש.`],
            ],
            next: [`אפשר לעצור כאן את ההוצאות על ${name} עד סוף החודש, או לעדכן את היעד אם הוא כבר לא מתאים.`],
          },
          helpful: null,
        },
      ];
    }

    const expectedByNow = t.planned * share;
    if (
      share < PACE_UNTIL_SHARE &&
      t.actual >= expectedByNow * PACE_TIMES &&
      t.actual - expectedByNow >= PACE_MIN_ILS
    ) {
      const projection = Math.round(t.actual / share);
      return [
        {
          // A new card each time another quarter of the target is gone.
          key: `tracker-pace:${input.month}:${name}:q${Math.floor((t.actual / t.planned) * 4)}`,
          kind: 'tracker-pace',
          art: 'bars',
          title: `${name} בקצב מהיר מהרגיל:`,
          body: ['כבר יצאו ', { amount: t.actual }, ' מתוך ', { amount: t.planned }, `, ועברו רק ${Math.round(share * 100)}% מהחודש.`],
          detail: {
            heading: `${name} בקצב מהיר`,
            paragraphs: [
              ['בקצב הזה תגיעו לכ-', { amount: projection }, ' עד סוף החודש, ', { amount: round(projection - t.planned) }, ' מעל היעד.'],
              ['כדי לעמוד ביעד נשארו ', { amount: round(t.planned - t.actual) }, ` ל-${daysLeft} הימים שנשארו בחודש.`],
            ],
            next: ['אם זה חודש חריג — הכול בסדר. אם לא, כדאי להאט קצת עד סוף החודש.'],
          },
          helpful: null,
        },
      ];
    }
    return [];
  });
}

const INCOME_MIN_ILS = 500;
const INCOME_RECENT_DAYS = 2;

/** Income that came in during the last three days. */
export function incomeInsight(input: InsightInput): Insight | null {
  const incomeEnvelopes = input.envelopes.filter((e) => INCOME_TYPES.has(e.type));
  const from = addDays(input.today, -INCOME_RECENT_DAYS);
  const top = incomeEnvelopes
    .flatMap((e) => e.actuals)
    .filter((a) => a.transactionDate && a.transactionDate >= from && a.transactionDate <= input.today && a.amountIls >= INCOME_MIN_ILS)
    .sort((a, b) => b.amountIls - a.amountIls)[0];
  if (!top) return null;

  const from_ = top.businessName || top.categoryLabel || 'הכנסה';
  return {
    key: `income:${top.transactionId}`,
    kind: 'income',
    art: 'income',
    title: 'נכנסה הכנסה:',
    body: [{ amount: top.amountIls }, ` מ-${from_}.`],
    detail: {
      heading: 'נכנסה הכנסה',
      paragraphs: [
        [`ב-${dmy(top.transactionDate!)} נכנסו `, { amount: top.amountIls }, ` מ-${from_}.`],
        [
          'עד עכשיו נכנסו החודש ',
          { amount: sum(incomeEnvelopes.map((e) => e.actual)) },
          ' מתוך ',
          { amount: sum(incomeEnvelopes.map((e) => e.expected)) },
          ' שצפויים להיכנס.',
        ],
      ],
      next: ['אם ההכנסה שונה ממה שציפיתם, כדאי לעדכן את צפי ההכנסות כדי שהתחזית תישאר מדויקת.'],
    },
    helpful: null,
  };
}

const CASH_LOW_STEP_ILS = 200;

/** Less cash in the wallets than the cash payments still planned this month. */
export function cashLowInsight(input: InsightInput): Insight | null {
  const planned = input.envelopes.flatMap((e) => e.pending).filter((p) => p.kind === 'spend');
  const plannedTotal = sum(planned.map((p) => p.amountIls));
  const balance = round(Math.max(input.wallet.balance, 0));
  if (plannedTotal <= 0 || balance >= plannedTotal) return null;
  const gap = round(plannedTotal - balance);

  return {
    // A new card for every further 200 ₪ the wallets fall short.
    key: steppedKey(`cash-low:${input.month}`, gap, CASH_LOW_STEP_ILS),
    kind: 'cash-low',
    art: 'wallet',
    title: 'המזומן בארנקים לא יספיק:',
    body: ['יש בהם ', { amount: balance }, ', ועד סוף החודש מתוכננות הוצאות במזומן של ', { amount: plannedTotal }, '.'],
    detail: {
      heading: 'המזומן לא יספיק',
      paragraphs: [
        ...input.wallet.wallets.map((w): RichText => [`ב${w.name} יש `, { amount: Math.max(w.balance, 0) }, '.']),
        [
          `עד סוף החודש מתוכננים עוד ${planned.length === 1 ? 'תשלום אחד' : `${planned.length} תשלומים`} במזומן, בסך `,
          { amount: plannedTotal },
          '.',
        ],
      ],
      next: ['כדאי למשוך עוד ', { amount: gap }, ', או לעדכן את התשלומים המתוכננים.'],
    },
    helpful: null,
  };
}

const FORECAST_MIN_ILS = 100;
const FORECAST_MIN_SHARE = 0.02;

/** How the month's forecast moved since yesterday. */
export function forecastInsight(input: InsightInput): Insight | null {
  if (input.yesterdayForecast === null) return null;
  const diff = round(input.forecast - input.yesterdayForecast);
  if (Math.abs(diff) < Math.max(FORECAST_MIN_ILS, Math.abs(input.yesterdayForecast) * FORECAST_MIN_SHARE)) return null;
  const up = diff > 0;
  const monthName = monthLabel(input.month).split(' ')[0];

  return {
    key: `forecast:${input.today}`,
    kind: 'forecast',
    art: up ? 'chart-up' : 'chart-down',
    title: up ? 'תחזית סוף החודש השתפרה:' : 'תחזית סוף החודש ירדה:',
    body: ['ב-', { amount: Math.abs(diff) }, ' מאתמול, ל-', { amount: input.forecast, signed: true }, '.'],
    detail: {
      heading: 'התחזית זזה מאתמול',
      paragraphs: [
        [
          `אתמול התחזית לסוף ${monthName} הייתה `,
          { amount: input.yesterdayForecast, signed: true },
          ', והיום היא ',
          { amount: input.forecast, signed: true },
          '.',
        ],
        ['התחזית היא ההכנסות הצפויות פחות כל ההוצאות הצפויות. היא זזה כשנכנסים חיובים או הכנסות חדשים, או כשמשתנה צפי.'],
      ],
      next: ['אפשר לעבור על החיובים החדשים בסיכום היומי ולראות מה הזיז אותה.'],
    },
    helpful: null,
  };
}

/**
 * Every card worth showing, in order — without the ones this member already
 * had: dismissed, opened, or first shown on an earlier day (V2-17).
 */
export function computeInsights(input: InsightInput, feedback: InsightFeedback): Insight[] {
  const all = [
    forecastInsight(input),
    bigChargeInsight(input),
    ...trackerInsights(input),
    incomeInsight(input),
    cashLowInsight(input),
  ].filter((i): i is Insight => i !== null);

  return all
    .filter((i) => stillShowable(i.key, feedback, input.today))
    .map((i) => ({ ...i, helpful: feedback.get(i.key)?.helpful ?? null }))
    .slice(0, MAX_CARDS);
}
