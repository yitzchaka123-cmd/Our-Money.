/**
 * The daily brief: one swipe card for everything new since a member last read
 * it — RiseUp charges that reached us since then, cash logged since then, and
 * any cash entry still waiting for review — each with one short line under
 * it: an insight that is true of the couple's own history when there is one,
 * else a plain note of where it went in the month ("נכנס לתזרים של אוקטובר
 * תחת סופר"), so no card is empty.
 *
 * Pure: the loader (brief-load.ts) gathers the rows, this decides what to say.
 * Safe to import from client components.
 */

import type { AccountRef } from '@/lib/dashboard/accounts';
import { monthParts } from '@/lib/money';
import type { NormalizedActual } from '@/lib/riseup/envelopes';
import type { CashSpend, CashTopup, EnvelopeType } from '@/lib/types';

// ---------------------------------------------------------------------------
// Insight text
// ---------------------------------------------------------------------------

/**
 * Prose with amounts kept apart, so a card can colour them. An amount is a
 * magnitude — the words carry the direction — unless it is `signed`, as a
 * forecast is.
 */
export type RichText = Array<string | { amount: number; signed?: boolean }>;

export type BriefRule =
  | 'higher'
  | 'lower'
  | 'nth-this-month'
  | 'first-time'
  | 'tracker-crossed'
  | 'tracker-over'
  | 'tracker-near'
  | 'withdrawal-wallet'
  | 'needs-review'
  /** Nothing notable: where the item went in the month's cashflow. */
  | 'filed';

export interface BriefInsight {
  rule: BriefRule;
  text: RichText;
}

/**
 * An amount as prose: "86.19 ₪", "7,000 ₪". A signed negative gets a
 * left-to-right mark before its minus, so RTL text keeps it in front.
 */
export function proseAmount(value: number, signed = false): string {
  const magnitude = Math.round(Math.abs(value) * 100) / 100;
  const whole = Number.isInteger(magnitude);
  const digits = magnitude.toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${signed && value < 0 && magnitude > 0 ? '\u200E-' : ''}${digits} ₪`;
}

/** The insight as one plain string — for tests, aria labels and logs. */
export function insightText(insight: { text: RichText }): string {
  return insight.text.map((part) => (typeof part === 'string' ? part : proseAmount(part.amount, part.signed))).join('');
}

// ---------------------------------------------------------------------------
// Merchant history: higher / lower than usual, Nth this month, first time
// ---------------------------------------------------------------------------

export interface HistoryTxn {
  id: string;
  date: string | null;
  business: string;
  amount: number;
  isIncome: boolean;
}

/** How far back "usual" looks. */
const USUAL_WINDOW_DAYS = 180;
/** A difference worth a sentence: at least this much… */
const USUAL_MIN_ILS = 20;
/** …and at least this share of the usual amount. */
const USUAL_MIN_SHARE = 0.1;
/** "First time" needs this much history before the charge to be a fact. */
const FIRST_TIME_COVERAGE_DAYS = 60;
/** The Nth charge at one business this month is worth saying from here. */
const NTH_FROM = 3;

export function normalizeBusiness(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Strictly before the target: an earlier day, or the same day and an earlier id. */
function isBefore(a: { id: string; date: string }, b: { id: string; date: string }): boolean {
  return a.date < b.date || (a.date === b.date && a.id < b.id);
}

/**
 * What this business's own history says about this charge. Only earlier
 * charges count, so the sentence was already true the day it arrived.
 */
export function merchantInsight(target: HistoryTxn, history: HistoryTxn[]): BriefInsight | null {
  if (!target.date || !target.business.trim()) return null;
  const t = { ...target, date: target.date };
  const key = normalizeBusiness(target.business);
  const name = target.business.trim();

  const prior = history.filter(
    (h): h is HistoryTxn & { date: string } =>
      h.id !== t.id &&
      h.date !== null &&
      h.isIncome === t.isIncome &&
      normalizeBusiness(h.business) === key &&
      isBefore({ id: h.id, date: h.date }, t),
  );

  const usual = prior.filter((h) => daysBetween(h.date, t.date) <= USUAL_WINDOW_DAYS).map((h) => Math.abs(h.amount));
  if (usual.length >= 2) {
    const typical = round2(median(usual));
    const diff = round2(Math.abs(t.amount) - typical);
    if (Math.abs(diff) >= Math.max(USUAL_MIN_ILS, typical * USUAL_MIN_SHARE)) {
      const higher = diff > 0;
      const what = t.isIncome ? 'ההכנסה הזו' : 'זיהינו שההוצאה הזו';
      const usualWord = t.isIncome ? 'בדרך כלל נכנסים ' : 'בדרך כלל יוצאים כאן ';
      return {
        rule: higher ? 'higher' : 'lower',
        text: [`${what} ${higher ? 'גבוהה' : 'נמוכה'} ב-`, { amount: Math.abs(diff) }, ` מהרגיל. ${usualWord}`, { amount: typical }, '.'],
      };
    }
  }

  const sameMonth = prior.filter((h) => h.date.slice(0, 7) === t.date.slice(0, 7)).length + 1;
  if (sameMonth >= NTH_FROM) {
    return {
      rule: 'nth-this-month',
      text: [t.isIncome ? `זו הפעם ה-${sameMonth} החודש שנכנס כסף מ-${name}.` : `זו הפעם ה-${sameMonth} החודש שיש חיוב ב-${name}.`],
    };
  }

  if (prior.length === 0) {
    const earliest = history.reduce<string | null>(
      (min, h) => (h.date && h.id !== t.id && (min === null || h.date < min) ? h.date : min),
      null,
    );
    if (earliest && daysBetween(earliest, t.date) >= FIRST_TIME_COVERAGE_DAYS) {
      return {
        rule: 'first-time',
        text: [t.isIncome ? `זו הפעם הראשונה שנכנס כסף מ-${name}.` : `זו הפעם הראשונה שאנחנו רואים חיוב ב-${name}.`],
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Trackers: crossed the target, already over it, little left
// ---------------------------------------------------------------------------

export interface TrackerContext {
  name: string;
  /** RiseUp's monthly target for the tracker. */
  planned: number;
  /** Every charge filed in it this month, cash included. */
  actuals: Array<{ id: string; date: string | null; amount: number }>;
}

/** Share of the target after which "only N left" is worth saying. */
const NEAR_SHARE = 0.8;

export function trackerInsight(
  target: { id: string; date: string | null; amount: number },
  tracker: TrackerContext,
): BriefInsight | null {
  if (tracker.planned <= 0 || !target.date) return null;
  const t = { id: target.id, date: target.date };
  const before = round2(
    tracker.actuals
      .filter((a) => a.id !== t.id && a.date !== null && isBefore({ id: a.id, date: a.date }, t))
      .reduce((sum, a) => sum + Math.abs(a.amount), 0),
  );
  const after = round2(before + Math.abs(target.amount));
  const name = tracker.name;

  if (before <= tracker.planned && after > tracker.planned) {
    return {
      rule: 'tracker-crossed',
      text: [`ההוצאה הזו העבירה את ${name} מעל היעד החודשי ב-`, { amount: round2(after - tracker.planned) }, '.'],
    };
  }
  if (before > tracker.planned) {
    return {
      rule: 'tracker-over',
      text: [`עם ההוצאה הזו, ${name} כבר `, { amount: round2(after - tracker.planned) }, ' מעל היעד החודשי.'],
    };
  }
  if (after >= tracker.planned * NEAR_SHARE) {
    return {
      rule: 'tracker-near',
      text: ['עם ההוצאה הזו נשארו ', { amount: round2(tracker.planned - after) }, ` ב-${name} עד סוף החודש.`],
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The cards
// ---------------------------------------------------------------------------

export type BriefKind = 'riseup' | 'cash-spend' | 'cash-income' | 'cash-withdrawal';
/** The envelope colour a card wears; a withdrawal has none of its own. */
export type BriefColour = EnvelopeType | 'withdrawal';

export interface BriefItem {
  key: string;
  kind: BriefKind;
  amountIls: number;
  isIncome: boolean;
  /** The small line on top: "הוצאות קבועות · חשמל". */
  label: string;
  envelopeType: BriefColour;
  envelopeTitle: string;
  envelopeId: string | null;
  business: string;
  date: string | null;
  /** "לאומי קארד 2", "כרטיס 0848", "חשבון 674-1908922", "מזומן · ארנק ראשי" — never a RiseUp code. */
  account: string | null;
  memberName: string | null;
  /** Who logged it — what an edit keeps. Null for RiseUp rows; every loader sets it. */
  memberId?: string | null;
  needsReview: boolean;
  insight: BriefInsight | null;
  /** The row as the dashboard knows it, so "לערוך" opens the same sheet. */
  actual: NormalizedActual;
  /** When it reached us. */
  seenAt: string;
}

export interface BriefData {
  /** Server time the brief was built; finishing it marks everything up to here read. */
  asOf: string;
  seenUntil: string;
  count: number;
  items: BriefItem[];
}

export const EMPTY_BRIEF: BriefData = { asOf: '', seenUntil: '', count: 0, items: [] };

/** A row of `riseup_transactions`, as the loader selects it. */
export interface RiseupRow {
  transaction_id: string;
  transaction_date: string | null;
  cashflow_month: string | null;
  business_name: string | null;
  amount_ils: number | string | null;
  is_income: boolean | null;
  account_nickname: string | null;
  account_number_hash: string | null;
  category_label: string | null;
  is_withdrawal: boolean;
  first_seen_at: string;
  /** The provider ("leumicard"), so an unnamed card reads as "לאומי קארד 1". */
  source?: string | null;
  source_type?: string | null;
}

/** One envelope of a month, as the dashboard assembles it (cash filed in). */
export interface BriefEnvelope {
  envelopeId: string;
  type: EnvelopeType;
  title: string;
  /** RiseUp's own plan for it — a tracker's target. */
  planned: number;
  actuals: NormalizedActual[];
}

export interface BriefSource {
  asOf: string;
  seenUntil: string;
  /** RiseUp rows first seen after `seenUntil`. */
  newRiseup: RiseupRow[];
  /** Every known RiseUp charge (withdrawals excluded), for the merchant rules. */
  history: HistoryTxn[];
  /** Assembled envelopes for each month a new item falls in. */
  envelopesByMonth: Record<string, BriefEnvelope[]>;
  /** Candidates: spends logged after `seenUntil` and any still needing review. */
  cashSpends: CashSpend[];
  /** Candidates: cash income and hand-typed withdrawals logged after `seenUntil`. */
  cashTopups: CashTopup[];
  /** Top-ups the sync made from bank withdrawals, to say which wallet got the cash. */
  withdrawalTopups: CashTopup[];
  wallets: Array<{ id: string; name: string; isDefault: boolean }>;
  memberNames: Map<string, string>;
  /** Names a card or bank account as the dashboard does (lib/dashboard/accounts.ts). */
  nameAccount?: (account: AccountRef) => string | null;
}

const TYPE_LABELS: Partial<Record<EnvelopeType, string>> = {
  variable: 'הוצאות משתנות',
  fixed: 'הוצאות קבועות',
  variableIncome: 'הכנסות משתנות',
  cashIncome: 'הכנסה במזומן',
  riseupGoal: 'הפקדות לחיסכון',
};

export function briefLabel(type: EnvelopeType, title: string, category: string | null, isCash: boolean): string {
  const base = type === 'trackingCategory' ? `קטגוריה למעקב · ${title}` : (TYPE_LABELS[type] ?? title);
  const withCategory =
    (type === 'variable' || type === 'fixed') && category && category !== base ? `${base} · ${category}` : base;
  return isCash && type !== 'cashIncome' ? `מזומן · ${withCategory}` : withCategory;
}

/**
 * The account line of a RiseUp card: the name the dashboard gives the account
 * (the couple's name, RiseUp's nickname, or the provider, numbered when two
 * share it). A charge not in any envelope yet is named the same way, then
 * falls back to RiseUp's nickname or a real account number — never the
 * opaque code ("cc5910") RiseUp uses to tell cards apart.
 */
function accountLabel(found: NormalizedActual | undefined, row: RiseupRow, src: BriefSource): string | null {
  if (found?.accountName) return found.accountName;
  if (src.nameAccount && (row.source || row.source_type)) {
    const named = src.nameAccount({
      source: row.source ?? null,
      hash: row.account_number_hash,
      nickname: row.account_nickname,
      sourceType: row.source_type ?? null,
    });
    if (named) return named;
  }
  if (row.account_nickname?.trim()) return row.account_nickname.trim();
  if (row.account_number_hash?.includes('-')) return `חשבון ${row.account_number_hash}`;
  return null;
}

// ---------------------------------------------------------------------------
// The plain line: where an item went, when nothing more is worth saying
// ---------------------------------------------------------------------------

function monthName(month: string): string {
  return monthParts(month).name;
}

/** "סופר", "הוצאות קבועות, בקטגוריה חשמל", "הכנסות משתנות". */
function filedUnder(type: EnvelopeType, title: string, category: string | null): string {
  if (type === 'trackingCategory') return title;
  const base = TYPE_LABELS[type] ?? title;
  return (type === 'variable' || type === 'fixed') && category && category !== base ? `${base}, בקטגוריה ${category}` : base;
}

function filed(text: string): BriefInsight {
  return { rule: 'filed', text: [text] };
}

/** Said of a withdrawal, which moves money rather than spending it (lib/dashboard/data.ts). */
const WITHDRAWAL_NOTE = 'משיכה לא נספרת כהוצאה בתזרים — רק מה שקונים במזומן.';

function findEnvelope(
  envelopes: BriefEnvelope[] | undefined,
  match: (a: NormalizedActual) => boolean,
): { envelope: BriefEnvelope; actual: NormalizedActual } | null {
  for (const envelope of envelopes ?? []) {
    const actual = envelope.actuals.find(match);
    if (actual) return { envelope, actual };
  }
  return null;
}

function trackerFor(envelope: BriefEnvelope): TrackerContext {
  return {
    name: envelope.title,
    planned: envelope.planned,
    actuals: envelope.actuals.map((a) => ({ id: a.transactionId, date: a.transactionDate, amount: a.amountIls })),
  };
}

function fallbackActual(row: RiseupRow): NormalizedActual {
  return {
    transactionId: row.transaction_id,
    transactionDate: row.transaction_date,
    billingDate: row.transaction_date,
    businessName: row.business_name ?? '',
    amountIls: Math.abs(Number(row.amount_ils ?? 0)),
    isIncome: Boolean(row.is_income),
    accountNickname: row.account_nickname,
    accountNumberHash: row.account_number_hash,
    source: row.source ?? null,
    isInstallment: false,
    paymentNumber: null,
    totalPayments: null,
    categoryLabel: row.category_label,
  };
}

function riseupItem(row: RiseupRow, src: BriefSource): BriefItem {
  const month = row.cashflow_month ?? row.transaction_date?.slice(0, 7) ?? '';
  const amount = Math.abs(Number(row.amount_ils ?? 0));
  const isIncome = Boolean(row.is_income);
  const base = {
    key: `riseup:${row.transaction_id}`,
    kind: 'riseup' as const,
    amountIls: amount,
    isIncome,
    business: row.business_name ?? '',
    date: row.transaction_date,
    account: accountLabel(undefined, row, src),
    memberName: null,
    memberId: null,
    needsReview: false,
    seenAt: row.first_seen_at,
  };

  if (row.is_withdrawal) {
    const topup = src.withdrawalTopups.find((t) => t.riseup_transaction_id === row.transaction_id && !t.is_dismissed);
    const walletId = topup ? (topup.wallet_id ?? src.wallets.find((w) => w.isDefault)?.id ?? null) : null;
    const wallet = src.wallets.find((w) => w.id === walletId);
    return {
      ...base,
      label: 'משיכת מזומן',
      envelopeType: 'withdrawal',
      envelopeTitle: 'משיכת מזומן',
      envelopeId: null,
      insight: wallet ? { rule: 'withdrawal-wallet', text: [`המשיכה נרשמה כמזומן ב-${wallet.name}.`] } : filed(WITHDRAWAL_NOTE),
      actual: fallbackActual(row),
    };
  }

  const envelopes = src.envelopesByMonth[month];
  // The budget and the transaction feed share ids; a charge the budget lists
  // under another id is still found by what it is.
  const found =
    findEnvelope(envelopes, (a) => a.transactionId === row.transaction_id) ??
    findEnvelope(
      envelopes,
      (a) =>
        !a.cash &&
        a.isIncome === isIncome &&
        a.transactionDate === row.transaction_date &&
        Math.abs(a.amountIls - amount) < 0.005 &&
        normalizeBusiness(a.businessName) === normalizeBusiness(row.business_name ?? ''),
    );

  const type: EnvelopeType = found?.envelope.type ?? (isIncome ? 'variableIncome' : 'variable');
  const title = found?.envelope.title ?? TYPE_LABELS[type] ?? '';
  const actual = found?.actual ?? fallbackActual(row);
  const category = actual.categoryLabel ?? row.category_label;

  const tracker =
    found && found.envelope.type === 'trackingCategory'
      ? trackerInsight({ id: actual.transactionId, date: actual.transactionDate, amount }, trackerFor(found.envelope))
      : null;

  return {
    ...base,
    account: accountLabel(found?.actual, row, src),
    label: briefLabel(type, title, category, false),
    envelopeType: type,
    envelopeTitle: title,
    envelopeId: found?.envelope.envelopeId ?? null,
    insight:
      tracker ??
      merchantInsight(
        { id: row.transaction_id, date: row.transaction_date, business: row.business_name ?? '', amount, isIncome },
        src.history,
      ) ??
      (!month
        ? null
        : found
          ? filed(`${isIncome ? 'נכנסה' : 'נכנס'} לתזרים של ${monthName(month)} תחת ${filedUnder(type, title, category)}.`)
          : filed(`חדש מרייזאפ — עוד לא מופיע באף קטגוריה בתזרים של ${monthName(month)}.`)),
    actual,
  };
}

function walletName(src: BriefSource, walletId: string | null): string {
  const id = walletId ?? src.wallets.find((w) => w.isDefault)?.id;
  return src.wallets.find((w) => w.id === id)?.name ?? 'הארנק';
}

function walletLine(src: BriefSource, walletId: string | null): string {
  const id = walletId ?? src.wallets.find((w) => w.isDefault)?.id;
  const wallet = src.wallets.find((w) => w.id === id);
  return wallet ? `מזומן · ${wallet.name}` : 'מזומן';
}

const REVIEW_TEXT: RichText = ['הבוט לא היה בטוח בסכום או בקטגוריה. כדאי לבדוק ולאשר.'];

function spendItem(spend: CashSpend, src: BriefSource): BriefItem {
  const month = spend.spent_at.slice(0, 7);
  const id = `cash:${spend.id}`;
  const found = findEnvelope(src.envelopesByMonth[month], (a) => a.transactionId === id);
  const type: EnvelopeType = found?.envelope.type ?? 'variable';
  const title = found?.envelope.title ?? TYPE_LABELS.variable!;
  const amount = Number(spend.amount_ils);
  const memberName = src.memberNames.get(spend.member_id) ?? null;
  const needsReview = spend.status === 'needs_review';

  const actual: NormalizedActual = found?.actual ?? {
    transactionId: id,
    transactionDate: spend.spent_at,
    billingDate: spend.spent_at,
    businessName: spend.note || spend.category,
    amountIls: amount,
    isIncome: false,
    accountNickname: 'מזומן',
    accountNumberHash: null,
    source: 'cash',
    isInstallment: false,
    paymentNumber: null,
    totalPayments: null,
    categoryLabel: spend.category,
    cash: {
      id: spend.id,
      kind: 'spend',
      memberId: spend.member_id,
      memberName,
      inputKind: spend.input_kind,
      status: needsReview ? 'needs_review' : 'confirmed',
      walletId: spend.wallet_id,
    },
  };

  const tracker =
    found && found.envelope.type === 'trackingCategory'
      ? trackerInsight({ id, date: spend.spent_at, amount }, trackerFor(found.envelope))
      : null;

  return {
    key: `cash-spend:${spend.id}`,
    kind: 'cash-spend',
    amountIls: amount,
    isIncome: false,
    label: briefLabel(type, title, spend.category, true),
    envelopeType: type,
    envelopeTitle: title,
    envelopeId: found?.envelope.envelopeId ?? spend.envelope_id,
    business: spend.note || spend.category,
    date: spend.spent_at,
    account: walletLine(src, spend.wallet_id),
    memberName,
    memberId: spend.member_id,
    needsReview,
    insight: needsReview
      ? { rule: 'needs-review', text: REVIEW_TEXT }
      : (tracker ??
        filed(`נרשם במזומן ונכנס לתזרים של ${monthName(month)} תחת ${filedUnder(type, title, spend.category)}.`)),
    actual,
    seenAt: spend.created_at,
  };
}

function topupItem(topup: CashTopup, src: BriefSource): BriefItem {
  const income = topup.source === 'cash_income';
  const amount = Number(topup.amount_ils);
  const memberName = topup.member_id ? (src.memberNames.get(topup.member_id) ?? null) : null;
  const business = income
    ? topup.note || topup.category || 'הכנסה במזומן'
    : topup.note || topup.business_name || 'משיכת מזומן';

  return {
    key: `${income ? 'cash-income' : 'cash-withdrawal'}:${topup.id}`,
    kind: income ? 'cash-income' : 'cash-withdrawal',
    amountIls: amount,
    isIncome: income,
    label: income ? 'הכנסה במזומן' : 'משיכת מזומן',
    envelopeType: income ? 'cashIncome' : 'withdrawal',
    envelopeTitle: income ? 'הכנסות במזומן' : 'משיכת מזומן',
    envelopeId: null,
    business,
    date: topup.occurred_at,
    account: walletLine(src, topup.wallet_id),
    memberName,
    memberId: topup.member_id ?? null,
    needsReview: false,
    insight: income
      ? filed(`נכנסה ל-${walletName(src, topup.wallet_id)} ונספרת כהכנסה בתזרים של ${monthName(topup.occurred_at.slice(0, 7))}.`)
      : filed(`המזומן נוסף ל-${walletName(src, topup.wallet_id)}. ${WITHDRAWAL_NOTE}`),
    actual: {
      transactionId: `${income ? 'cash-income' : 'cash-withdrawal'}:${topup.id}`,
      transactionDate: topup.occurred_at,
      billingDate: topup.occurred_at,
      businessName: business,
      amountIls: amount,
      isIncome: income,
      accountNickname: 'מזומן',
      accountNumberHash: null,
      source: 'cash',
      isInstallment: false,
      paymentNumber: null,
      totalPayments: null,
      categoryLabel: topup.category,
      cash: income
        ? { id: topup.id, kind: 'income', memberId: topup.member_id ?? null, memberName, inputKind: topup.input_kind ?? 'text', status: 'confirmed', walletId: topup.wallet_id }
        : undefined,
    },
    seenAt: topup.created_at ?? topup.occurred_at,
  };
}

/** Every card the member has not seen, oldest first; the count is their number. */
export function buildBrief(src: BriefSource): BriefData {
  const after = (iso: string | null | undefined) => Boolean(iso) && Date.parse(iso!) > Date.parse(src.seenUntil);

  const items: BriefItem[] = [
    ...src.newRiseup.filter((r) => after(r.first_seen_at)).map((r) => riseupItem(r, src)),
    ...src.cashSpends
      .filter((s) => s.status !== 'deleted' && (s.status === 'needs_review' || after(s.created_at)))
      .map((s) => spendItem(s, src)),
    ...src.cashTopups
      .filter((t) => !t.is_dismissed && (t.source === 'cash_income' || t.source === 'manual') && after(t.created_at))
      .map((t) => topupItem(t, src)),
  ];

  items.sort((a, b) => {
    const da = a.date ?? '';
    const db = b.date ?? '';
    if (da !== db) return da < db ? -1 : 1;
    return Date.parse(a.seenAt) - Date.parse(b.seenAt);
  });

  return { asOf: src.asOf, seenUntil: src.seenUntil, count: items.length, items };
}
