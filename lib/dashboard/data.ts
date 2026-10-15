import { envelopeChoices, resolveEnvelopeForCategory, type EnvelopeRef } from '@/lib/cash/envelopes';
import { loadAccountLabels } from '@/lib/dashboard/account-labels';
import { accountNamer, type AccountLabel, type AccountRef } from '@/lib/dashboard/accounts';
import {
  expectedWithCash,
  planEnvelope,
  planOccurrences,
  type CashPlan,
  type PlanOccurrence,
  type PlanSettlement,
} from '@/lib/cash/plans';
import { db } from '@/lib/db/client';
import { isoDateInIsrael } from '@/lib/dates';
import { monthBounds, walletBalances, walletState } from '@/lib/reconcile';
import {
  ENVELOPE_TITLES,
  plannedForType,
  sortEnvelopes,
  type NormalizedActual,
  type NormalizedEnvelope,
  type UpcomingCharge,
} from '@/lib/riseup/envelopes';
import { syncBanner, type SyncBanner } from '@/lib/riseup/banner';
import { mergeRiseupEnvelopes } from '@/lib/dashboard/merge-envelopes';
import { loadNameBook } from '@/lib/riseup/name-book';
import { isUnresolvedName, resolveTrackerName, type NameBook } from '@/lib/riseup/tracker-names';
import {
  prepareTrackers,
  settleTrackers,
  toOverrides,
  trackerKey,
  type OverrideInfo,
  type TrackerOverride,
  type TrackerOverrideRow,
} from '@/lib/dashboard/trackers';
import { loadSyncState } from '@/lib/riseup/sync';
import { matchesWithdrawalName } from '@/lib/riseup/withdrawals';
import { drawerName, greetingName, memberNameMap, signedInMember } from '@/lib/profile/names';
import { setupSteps, walletBalanceSet, type SetupStep } from '@/lib/dashboard/steps';
import { noteMap, type NoteRow } from '@/lib/dashboard/notes';
import type { CashSpend, CashTopup, CashTransfer, CashWallet, EnvelopeType, HouseholdMember } from '@/lib/types';

export interface EnvelopeView {
  key: string;
  envelopeId: string | null;
  type: EnvelopeType;
  title: string;
  actual: number;
  expected: number;
  actuals: NormalizedActual[];
  showRemaining: boolean;
  /** Expected cash not yet paid (or received) this month. */
  pending: PendingPlanView[];
  pendingTotal: number;
  /** Fixed charges RiseUp still expects this month ("צפוי לרדת"). */
  upcoming?: UpcomingCharge[];
  /** A tracker RiseUp keeps by the week: its breakdown is weekly. */
  weekly?: boolean;
  /** Trackers: the key that stays the same from month to month. */
  trackerKey?: string | null;
  /** Set when our own override (money.tracker_overrides) changed this envelope. */
  override?: OverrideInfo;
}

export interface PendingPlanView {
  planId: string;
  kind: 'spend' | 'income';
  amountIls: number;
  date: string;
  label: string;
  category: string;
  note: string | null;
  memberName: string | null;
  memberId: string | null;
  walletId: string | null;
  recurrence: 'monthly' | 'once';
  /** Where "paid" files the spend: this envelope, this month. */
  envelopeId: string | null;
}

export interface WalletMovement {
  id: string;
  /** 'adjustment': "there is really X in this wallet" — its amount is signed. */
  kind: 'withdrawal' | 'income' | 'spend' | 'transfer' | 'adjustment';
  amountIls: number;
  date: string;
  label: string;
  memberName: string | null;
  /** Who logged it — what an edit keeps. Every loader sets it. */
  memberId?: string | null;
  category: string | null;
  walletId: string | null;
  walletName: string | null;
  /** The typed note, separate from the label, so an edit sheet can prefill it. */
  note: string | null;
  /** A withdrawal RiseUp reported: its amount and date belong to the bank. */
  fromBank: boolean;
  /** Transfers only. */
  fromWalletId?: string;
  toWalletId?: string;
}

export interface WalletSummary {
  id: string;
  name: string;
  balance: number;
  isDefault: boolean;
  memberName: string | null;
}

export interface WalletView {
  /** All-time, across every wallet: what should physically be in cash right now. */
  balance: number;
  wallets: WalletSummary[];
  /** This month only. */
  withdrawn: number;
  income: number;
  spent: number;
  movements: WalletMovement[];
}

export interface DashboardData {
  month: string;
  months: string[];
  userName: string;
  greeting: string;
  lastUpdated: string | null;
  lastSyncAt: string | null;
  /** A sync problem worth telling the couple about, or null. */
  syncBanner: SyncBanner | null;
  /** Expected income minus every expected expense — RiseUp's headline number. */
  forecast: number;
  variableRemaining: number;
  totalActualExpenses: number;
  totalExpectedExpenses: number;
  envelopes: EnvelopeView[];
  /** Every active plan, for the plan management sheet. */
  plans: CashPlan[];
  /** What the cash-entry picker offers. */
  envelopeChoices: EnvelopeRef[];
  /** RiseUp's savings envelope this month, for "זו הפקדה לחיסכון!". */
  savingsEnvelopeId: string | null;
  wallet: WalletView;
  members: Pick<HouseholdMember, 'id' | 'display_name'>[];
  briefCount: number;
  /** The setup checklist behind the purple banner; all done hides it. */
  setupSteps: SetupStep[];
  /** The signed-in member's chosen name, for the checklist's name form. */
  preferredName: string | null;
}

const EXPENSE_TYPES = new Set<EnvelopeType>(['variable', 'fixed', 'trackingCategory', 'riseupGoal']);
const INCOME_TYPES = new Set<EnvelopeType>(['variableIncome', 'cashIncome']);

export function currentMonth(): string {
  return isoDateInIsrael().slice(0, 7);
}

/** Raw rows for one month, as stored. */
export interface MonthRows {
  month: string;
  envelopeRows: EnvelopeRow[];
  actualRows: ActualRow[];
  spends: CashSpend[];
  topups: CashTopup[];
  plans: CashPlan[];
  skippedPlanIds: ReadonlySet<string>;
  memberNames: Map<string, string>;
  /** Names learned in other months, for trackers stored without one. */
  names?: NameBook | null;
  /** The couple's names for cards and accounts; without them, provider names. */
  accountLabels?: AccountLabel[];
  /** Our tracker and expected-income overrides; RiseUp's API is read-only. */
  overrides?: TrackerOverride[];
  /** Our own notes on RiseUp charges, by transaction id. */
  notes?: ReadonlyMap<string, string>;
}

/**
 * One month's envelopes exactly as the dashboard shows them: RiseUp's, with
 * cash filed in, expected cash added, and every figure cash-aware. The
 * dashboard and the envelope history both go through here.
 */
export function assembleMonth(rows: MonthRows): {
  envelopes: EnvelopeView[];
  riseupEnvelopes: NormalizedEnvelope[];
} {
  const actualsByEnvelope = groupActuals(rows.actualRows, rows.accountLabels ?? [], rows.notes);
  const overrides = rows.overrides ?? [];
  // One fixed card and one card per tracker, as RiseUp shows them.
  const { envelopes: mergedRiseup, aliases } = mergeRiseupEnvelopes(
    rows.envelopeRows.map((row) => toNormalized(row, actualsByEnvelope, rows.names)),
    rows.names,
  );
  // RiseUp's envelopes as named and planned automatically, then ours on top.
  const prepared = prepareTrackers(mergedRiseup, overrides, rows.month);
  const riseupEnvelopes = prepared.envelopes;

  const occurrences = planOccurrences(
    rows.plans,
    rows.month,
    settlementsFrom(rows.spends, rows.topups),
    rows.skippedPlanIds,
  );

  const merged = settleTrackers(
    mergeCashIntoEnvelopes(riseupEnvelopes, rows.spends, rows.memberNames, aliases),
    overrides,
    prepared.info,
    rows.month,
  );
  const cashIncome = cashIncomeEnvelope(
    rows.topups,
    rows.memberNames,
    occurrences.some((o) => o.kind === 'income'),
  );
  const envelopes = applyCashFigures(
    sortEnvelopes([...merged, ...(cashIncome ? [cashIncome] : [])]),
    occurrences,
    rows.plans,
    rows.memberNames,
  ).map((view) => {
    const info = prepared.info.get(view.key);
    return info ? { ...view, override: info } : view;
  });
  const shown = new Set(merged.map((e) => e.envelopeId));
  return { envelopes, riseupEnvelopes: riseupEnvelopes.filter((e) => shown.has(e.envelopeId)) };
}

/** Income minus every expected expense — RiseUp's headline number. */
export function monthTotals(envelopes: EnvelopeView[]) {
  const income = sumBy(envelopes.filter((e) => INCOME_TYPES.has(e.type)), 'expected');
  const expectedExpenses = sumBy(envelopes.filter((e) => EXPENSE_TYPES.has(e.type)), 'expected');
  const actualExpenses = sumBy(envelopes.filter((e) => EXPENSE_TYPES.has(e.type)), 'actual');
  return {
    forecast: round(income - expectedExpenses),
    expectedExpenses: round(expectedExpenses),
    actualExpenses: round(actualExpenses),
  };
}

export function toPlans(rows: CashPlan[] | null | undefined): CashPlan[] {
  return (rows ?? []).map((p) => ({ ...p, amount_ils: Number(p.amount_ils) }));
}

export async function loadDashboard(month: string, sessionMemberId: string | null = null): Promise<DashboardData> {
  const supabase = db();
  const { from, to } = monthBounds(month);

  const [
    { data: envelopeRows },
    { data: actualRows },
    { data: monthSpends },
    { data: monthTopups },
    { data: allSpends },
    { data: allTopups },
    { data: members },
    syncState,
    accountLabels,
    { data: monthList },
    { data: walletRows },
    { data: allTransfers },
    { data: monthTransfers },
    { data: planRows },
    { data: skipRows },
    names,
    { data: overrideRows },
    { data: noteRows },
  ] = await Promise.all([
    supabase.from('riseup_envelopes').select('*').eq('month', month).order('position'),
    supabase.from('riseup_envelope_actuals').select('*').eq('month', month),
    supabase
      .from('cash_spends')
      .select('*')
      .neq('status', 'deleted')
      .gte('spent_at', from)
      .lte('spent_at', to)
      .order('spent_at', { ascending: false }),
    supabase
      .from('cash_topups')
      .select('*')
      .eq('is_dismissed', false)
      .gte('occurred_at', from)
      .lte('occurred_at', to)
      .order('occurred_at', { ascending: false }),
    supabase.from('cash_spends').select('*').neq('status', 'deleted'),
    supabase.from('cash_topups').select('*').eq('is_dismissed', false),
    supabase.from('household_members').select('id, display_name, preferred_name, telegram_user_id'),
    loadSyncState(),
    loadAccountLabels(),
    supabase.from('riseup_envelopes').select('month'),
    supabase.from('cash_wallets').select('*').eq('is_archived', false).order('position').order('created_at'),
    supabase.from('cash_transfers').select('*').eq('is_dismissed', false),
    supabase
      .from('cash_transfers')
      .select('*')
      .eq('is_dismissed', false)
      .gte('occurred_at', from)
      .lte('occurred_at', to),
    supabase.from('cash_plans').select('*').eq('is_active', true).order('day_of_month'),
    supabase.from('cash_plan_skips').select('plan_id').eq('month', month),
    loadNameBook(),
    // Until migration 0006 is applied this errors, and there are simply no overrides.
    supabase.from('tracker_overrides').select('*').in('month', ['', month]),
    // Our notes on RiseUp charges — a short table; until 0011 is applied this errors and there are none.
    supabase.from('transaction_notes').select('transaction_id, note'),
  ]);

  const wallets = (walletRows ?? []) as CashWallet[];
  const memberRows = (members ?? []) as Pick<HouseholdMember, 'id' | 'display_name' | 'preferred_name' | 'telegram_user_id'>[];
  // Everywhere a member is named, it is the name they chose (if they chose one).
  const memberNames = memberNameMap(memberRows);
  const memberList = memberRows.map((m) => ({ id: m.id, display_name: memberNames.get(m.id)! }));

  const spends = (monthSpends ?? []) as CashSpend[];
  const topups = (monthTopups ?? []) as CashTopup[];
  const plans = toPlans(planRows as CashPlan[] | null);

  const { envelopes, riseupEnvelopes } = assembleMonth({
    month,
    envelopeRows: (envelopeRows ?? []) as EnvelopeRow[],
    actualRows: (actualRows ?? []) as ActualRow[],
    spends,
    topups,
    plans,
    skippedPlanIds: new Set(((skipRows ?? []) as { plan_id: string }[]).map((r) => r.plan_id)),
    memberNames,
    names,
    accountLabels,
    overrides: toOverrides(overrideRows as TrackerOverrideRow[] | null),
    notes: noteMap(noteRows as NoteRow[] | null),
  });

  const totals = monthTotals(envelopes);
  const variable = envelopes.find((e) => e.type === 'variable');
  const me = signedInMember(memberRows, sessionMemberId);

  const lastSyncAt = syncState.lastSuccessAt;

  return {
    month,
    months: uniqueMonths(
      ((monthList ?? []) as { month: string }[]).map((row) => row.month),
      month,
    ),
    // The drawer header, like the greeting: the chosen name or just "היי".
    userName: drawerName(me),
    // Never the Telegram account's name: until they choose one, just "היי".
    greeting: greetingName(me),
    lastUpdated: formatUpdated(lastSyncAt),
    lastSyncAt,
    syncBanner: syncBanner(syncState),
    forecast: totals.forecast,
    // Cash already promised is not free to spend, even before it goes out.
    variableRemaining: variable
      ? round(Math.max(variable.expected - variable.actual - variable.pendingTotal, 0))
      : 0,
    totalActualExpenses: totals.actualExpenses,
    totalExpectedExpenses: totals.expectedExpenses,
    envelopes,
    plans,
    envelopeChoices: envelopeChoices(riseupEnvelopes.map(toRef)),
    savingsEnvelopeId: riseupEnvelopes.find((e) => e.type === 'riseupGoal')?.envelopeId ?? null,
    wallet: buildWallet({
      wallets,
      allTopups: (allTopups ?? []) as CashTopup[],
      allSpends: (allSpends ?? []) as CashSpend[],
      allTransfers: (allTransfers ?? []) as CashTransfer[],
      monthTopups: topups,
      monthSpends: spends,
      monthTransfers: (monthTransfers ?? []) as CashTransfer[],
      memberNames,
    }),
    members: memberList,
    briefCount: spends.filter((s) => s.status === 'needs_review').length,
    setupSteps: setupSteps({
      lastSyncAt,
      telegramLinked: Boolean(me && Number(me.telegram_user_id) > 0),
      preferredName: me?.preferred_name ?? null,
      walletBalanceSet: walletBalanceSet({
        topups: (allTopups ?? []) as CashTopup[],
        spends: (allSpends ?? []).length,
        transfers: (allTransfers ?? []).length,
      }),
    }),
    preferredName: me?.preferred_name ?? null,
  };
}

// ---------------------------------------------------------------------------
// RiseUp rows → normalized envelopes
// ---------------------------------------------------------------------------

export interface ActualRow {
  envelope_id: string;
  transaction_id: string;
  transaction_date: string | null;
  billing_date: string | null;
  business_name: string | null;
  amount_ils: number | string;
  is_income: boolean;
  account_nickname: string | null;
  account_number_hash: string | null;
  source: string | null;
  is_installment: boolean;
  payment_number: number | null;
  total_payments: number | null;
  category_label: string | null;
}

function groupActuals(
  rows: ActualRow[],
  labels: AccountLabel[],
  notes: ReadonlyMap<string, string> = new Map(),
): Map<string, NormalizedActual[]> {
  const grouped = new Map<string, NormalizedActual[]>();
  const accountOf = (row: ActualRow): AccountRef => ({ source: row.source, hash: row.account_number_hash, nickname: row.account_nickname });
  // Every row's card or account reads the same way: your name for it, else
  // RiseUp's nickname, else the provider — never RiseUp's opaque code.
  const nameAccount = accountNamer(rows.map(accountOf), labels);
  for (const row of rows) {
    // An ATM withdrawal is cash changing location, not spending. The wallet
    // accounts for that money and the cash entries say what it bought, so it
    // is dropped here to avoid counting it twice.
    if (matchesWithdrawalName(row.business_name)) continue;
    grouped.set(row.envelope_id, [
      ...(grouped.get(row.envelope_id) ?? []),
      {
        transactionId: row.transaction_id,
        transactionDate: row.transaction_date,
        billingDate: row.billing_date,
        businessName: row.business_name ?? '',
        amountIls: Number(row.amount_ils),
        isIncome: row.is_income,
        accountNickname: row.account_nickname,
        accountNumberHash: row.account_number_hash,
        accountName: nameAccount(accountOf(row)),
        source: row.source,
        isInstallment: row.is_installment,
        paymentNumber: row.payment_number,
        totalPayments: row.total_payments,
        categoryLabel: row.category_label,
        ...(notes.has(row.transaction_id) ? { note: notes.get(row.transaction_id) } : {}),
      },
    ]);
  }
  return grouped;
}

export interface EnvelopeRow {
  envelope_id: string;
  envelope_type: string;
  name: string | null;
  planned_ils: number | string;
  position: number;
}

function toNormalized(
  row: EnvelopeRow,
  actualsByEnvelope: Map<string, NormalizedActual[]>,
  names?: NameBook | null,
): NormalizedEnvelope {
  const actuals = actualsByEnvelope.get(row.envelope_id) ?? [];
  const type = row.envelope_type as EnvelopeType;
  const actualIls = round(actuals.reduce((sum, a) => sum + a.amountIls, 0));
  // Rows synced before trackers had names carry the raw id; name them now.
  const name =
    type === 'trackingCategory' && isUnresolvedName(row.name)
      ? resolveTrackerName({ envelopeId: row.envelope_id, ownLabels: actuals.map((a) => a.categoryLabel), book: names })
      : (row.name ?? ENVELOPE_TITLES[type] ?? row.envelope_id);
  return {
    envelopeId: row.envelope_id,
    type,
    name,
    plannedIls: plannedForType(type, Number(row.planned_ils), actualIls),
    actualIls,
    position: row.position,
    actuals,
  };
}

function toRef(envelope: NormalizedEnvelope): EnvelopeRef {
  return {
    envelopeId: envelope.envelopeId,
    type: envelope.type,
    name: envelope.name,
    categoryLabels: [
      ...new Set(
        [...envelope.actuals.map((a) => a.categoryLabel), ...(envelope.upcoming ?? []).map((u) => u.categoryLabel)].filter(
          (l): l is string => Boolean(l),
        ),
      ),
    ],
  };
}

function toView(envelope: NormalizedEnvelope): EnvelopeView {
  return {
    key: envelope.envelopeId,
    envelopeId: envelope.envelopeId,
    type: envelope.type,
    title: envelope.name,
    actual: envelope.actualIls,
    expected: envelope.plannedIls,
    actuals: envelope.actuals,
    showRemaining: envelope.type === 'trackingCategory' || envelope.type === 'riseupGoal',
    pending: [],
    pendingTotal: 0,
    ...(envelope.upcoming?.length ? { upcoming: envelope.upcoming } : {}),
    ...(envelope.weekly ? { weekly: true } : {}),
    trackerKey: envelope.type === 'trackingCategory' ? trackerKey(envelope.envelopeId) : null,
  };
}

// ---------------------------------------------------------------------------
// Expected cash → the same envelopes, and the forecast
// ---------------------------------------------------------------------------

function settlementsFrom(spends: CashSpend[], topups: CashTopup[]): PlanSettlement[] {
  return [
    ...spends
      .filter((s) => s.plan_id)
      .map((s) => ({ planId: s.plan_id!, entryId: s.id, amountIls: Number(s.amount_ils), date: s.spent_at })),
    ...topups
      .filter((t) => t.plan_id && t.source === 'cash_income')
      .map((t) => ({ planId: t.plan_id!, entryId: t.id, amountIls: Number(t.amount_ils), date: t.occurred_at })),
  ];
}

/**
 * File each plan occurrence into its envelope, list the pending ones in it,
 * and recompute the envelope's expected figure with its cash included.
 * Exported for the tests.
 */
export function applyCashFigures(
  envelopes: NormalizedEnvelope[],
  occurrences: PlanOccurrence[],
  plans: CashPlan[],
  memberNames: Map<string, string>,
): EnvelopeView[] {
  const list = [...envelopes];
  const refs = list.filter((e) => e.type !== 'cashIncome').map(toRef);
  const planById = new Map(plans.map((p) => [p.id, p]));
  const byEnvelope = new Map<string, PlanOccurrence[]>();

  for (const occurrence of occurrences) {
    const plan = planById.get(occurrence.planId);
    if (!plan) continue;

    let envelopeId: string | undefined;
    if (occurrence.kind === 'income') {
      envelopeId = list.find((e) => e.type === 'cashIncome')?.envelopeId;
    } else {
      envelopeId = planEnvelope(plan, refs)?.envelopeId;
      if (!envelopeId) {
        // Nothing synced yet: stand up the variable envelope, as for a spend.
        let fallback = list.find((e) => e.envelopeId === FALLBACK_VARIABLE_ID);
        if (!fallback) {
          fallback = emptyVariableEnvelope();
          list.push(fallback);
        }
        envelopeId = fallback.envelopeId;
      }
    }
    if (!envelopeId) continue;
    byEnvelope.set(envelopeId, [...(byEnvelope.get(envelopeId) ?? []), occurrence]);
  }

  return sortEnvelopes(list).map((envelope) => {
    const view = toView(envelope);
    const own = byEnvelope.get(envelope.envelopeId) ?? [];
    const pending = own.filter((o) => o.status === 'pending');
    const cashActual = round(envelope.actuals.filter((a) => a.cash).reduce((s, a) => s + a.amountIls, 0));
    const riseupActual = round(envelope.actualIls - cashActual);
    const pendingTotal = round(pending.reduce((s, o) => s + o.amountIls, 0));

    return {
      ...view,
      expected: expectedWithCash({
        type: envelope.type,
        riseupPlanned: envelope.plannedIls,
        riseupActual,
        cashActual,
        planCommitted: round(own.reduce((s, o) => s + o.amountIls, 0)),
        pending: pendingTotal,
      }),
      pending: pending.map((o) => ({
        planId: o.planId,
        kind: o.kind,
        amountIls: o.amountIls,
        date: o.date,
        label: o.note || o.category,
        category: o.category,
        note: o.note,
        memberName: o.memberId ? (memberNames.get(o.memberId) ?? null) : null,
        memberId: o.memberId,
        walletId: o.walletId,
        recurrence: o.recurrence,
        envelopeId: envelope.type === 'cashIncome' ? null : envelope.envelopeId,
      })),
      pendingTotal,
    };
  });
}

// ---------------------------------------------------------------------------
// Cash → the same envelopes
// ---------------------------------------------------------------------------

const FALLBACK_VARIABLE_ID = 'cash-fallback-variable';

/**
 * File each cash spend into the RiseUp envelope it belongs to, so it sits in
 * the same card and the same breakdown row a card spend would. A spend pinned
 * to an envelope keeps that pin; an unpinned one is resolved from its category
 * the way RiseUp itself would file it. Exported for the tests.
 */
export function mergeCashIntoEnvelopes(
  envelopes: NormalizedEnvelope[],
  spends: CashSpend[],
  memberNames: Map<string, string>,
  /** Ids folded into another envelope (one fixed card, one card per tracker). */
  aliases: ReadonlyMap<string, string> = new Map(),
): NormalizedEnvelope[] {
  const byId = new Map(envelopes.map((e) => [e.envelopeId, cloneEnvelope(e)]));
  const refs = envelopes.map(toRef);
  const fixedId = envelopes.find((e) => e.type === 'fixed')?.envelopeId;

  for (const spend of spends) {
    const pinned = spend.envelope_id ? (aliases.get(spend.envelope_id) ?? spend.envelope_id) : null;
    let target =
      (pinned && byId.get(pinned)) ||
      // There is one fixed card a month, so a spend filed as fixed belongs in it.
      (spend.envelope_type === 'fixed' ? pickById(byId, fixedId) : undefined) ||
      pickById(byId, resolveEnvelopeForCategory(refs, spend.category)?.envelopeId);

    // Before the first sync there is nothing to file into. Rather than lose the
    // entry, stand up the variable envelope RiseUp would have given it.
    if (!target) {
      target = byId.get(FALLBACK_VARIABLE_ID) ?? emptyVariableEnvelope();
      byId.set(FALLBACK_VARIABLE_ID, target);
    }

    target.actuals.push(spendToActual(spend, memberNames));
  }

  return [...byId.values()].map((e) => ({
    ...e,
    actualIls: round(e.actuals.reduce((sum, a) => sum + a.amountIls, 0)),
  }));
}

function emptyVariableEnvelope(): NormalizedEnvelope {
  return {
    envelopeId: FALLBACK_VARIABLE_ID,
    type: 'variable',
    name: ENVELOPE_TITLES.variable ?? 'הוצאות משתנות',
    plannedIls: 0,
    actualIls: 0,
    position: 0,
    actuals: [],
  };
}

function pickById(
  byId: Map<string, NormalizedEnvelope>,
  id: string | undefined,
): NormalizedEnvelope | undefined {
  return id ? byId.get(id) : undefined;
}

function cloneEnvelope(envelope: NormalizedEnvelope): NormalizedEnvelope {
  return { ...envelope, actuals: [...envelope.actuals] };
}

export function spendToActual(spend: CashSpend, memberNames: Map<string, string>): NormalizedActual {
  return {
    transactionId: `cash:${spend.id}`,
    transactionDate: spend.spent_at,
    billingDate: spend.spent_at,
    businessName: spend.note || spend.category,
    amountIls: Number(spend.amount_ils),
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
      memberName: memberNames.get(spend.member_id) ?? null,
      inputKind: spend.input_kind,
      status: spend.status === 'needs_review' ? 'needs_review' : 'confirmed',
      walletId: spend.wallet_id,
    },
  };
}

function incomeToActual(topup: CashTopup, memberNames: Map<string, string>): NormalizedActual {
  return {
    transactionId: `cash-income:${topup.id}`,
    transactionDate: topup.occurred_at,
    billingDate: topup.occurred_at,
    businessName: topup.note || topup.category || 'הכנסה במזומן',
    amountIls: Number(topup.amount_ils),
    isIncome: true,
    accountNickname: 'מזומן',
    accountNumberHash: null,
    source: 'cash',
    isInstallment: false,
    paymentNumber: null,
    totalPayments: null,
    categoryLabel: topup.category,
    cash: {
      id: topup.id,
      kind: 'income',
      memberId: topup.member_id ?? null,
      memberName: topup.member_id ? (memberNames.get(topup.member_id) ?? null) : null,
      inputKind: topup.input_kind ?? 'text',
      status: 'confirmed',
      walletId: topup.wallet_id,
    },
  };
}

/** Cash received this month, as an envelope beside RiseUp's own income. */
function cashIncomeEnvelope(
  topups: CashTopup[],
  memberNames: Map<string, string>,
  hasPlans: boolean,
): NormalizedEnvelope | null {
  const incomes = topups.filter((t) => t.source === 'cash_income');
  if (incomes.length === 0 && !hasPlans) return null;
  const actuals = incomes.map((t) => incomeToActual(t, memberNames));
  const total = round(actuals.reduce((sum, a) => sum + a.amountIls, 0));
  return {
    envelopeId: 'cash-income',
    type: 'cashIncome',
    name: ENVELOPE_TITLES.cashIncome ?? 'הכנסות במזומן',
    // Cash income has no plan; the envelope reads as fully received.
    plannedIls: total,
    actualIls: total,
    position: 0,
    actuals,
  };
}

// ---------------------------------------------------------------------------
// The cash bank
// ---------------------------------------------------------------------------

/** Exported for the tests. */
export function buildWallet({
  wallets,
  allTopups,
  allSpends,
  allTransfers,
  monthTopups,
  monthSpends,
  monthTransfers,
  memberNames,
}: {
  wallets: CashWallet[];
  allTopups: CashTopup[];
  allSpends: CashSpend[];
  allTransfers: CashTransfer[];
  monthTopups: CashTopup[];
  monthSpends: CashSpend[];
  monthTransfers: CashTransfer[];
  memberNames: Map<string, string>;
}): WalletView {
  const state = walletState(allTopups, allSpends);
  const walletName = new Map(wallets.map((w) => [w.id, w.name]));
  const fallbackId = wallets.find((w) => w.is_default)?.id ?? wallets[0]?.id ?? null;
  const nameOf = (id: string | null): string | null => walletName.get(id ?? fallbackId ?? '') ?? null;

  const balances = walletBalances(wallets, allTopups, allSpends, allTransfers);
  const summaries: WalletSummary[] = wallets.map((w) => ({
    id: w.id,
    name: w.name,
    balance: balances.find((b) => b.walletId === w.id)?.balance ?? 0,
    isDefault: w.is_default,
    memberName: w.member_id ? (memberNames.get(w.member_id) ?? null) : null,
  }));

  const movements: WalletMovement[] = [
    ...monthTopups.map((t): WalletMovement => ({
      id: t.id,
      kind: t.source === 'cash_income' ? 'income' : t.source === 'adjustment' ? 'adjustment' : 'withdrawal',
      amountIls: Number(t.amount_ils),
      date: t.occurred_at,
      label:
        t.source === 'cash_income'
          ? t.note || t.category || 'הכנסה במזומן'
          : t.source === 'adjustment'
            ? t.note || 'עדכון יתרה'
            : t.note || t.business_name || 'משיכת מזומן',
      memberName: t.member_id ? (memberNames.get(t.member_id) ?? null) : null,
      memberId: t.member_id ?? null,
      category: t.category,
      walletId: t.wallet_id ?? fallbackId,
      walletName: nameOf(t.wallet_id),
      note: t.note,
      fromBank: t.source === 'riseup_withdrawal' || t.riseup_transaction_id !== null,
    })),
    ...monthSpends.map((s): WalletMovement => ({
      id: s.id,
      kind: 'spend',
      amountIls: Number(s.amount_ils),
      date: s.spent_at,
      label: s.note || s.category,
      memberName: memberNames.get(s.member_id) ?? null,
      memberId: s.member_id,
      category: s.category,
      walletId: s.wallet_id ?? fallbackId,
      walletName: nameOf(s.wallet_id),
      note: s.note,
      fromBank: false,
    })),
    ...monthTransfers.map((x): WalletMovement => ({
      id: x.id,
      kind: 'transfer',
      amountIls: Number(x.amount_ils),
      date: x.occurred_at,
      label: `${walletName.get(x.from_wallet_id) ?? '?'} ← ${walletName.get(x.to_wallet_id) ?? '?'}`,
      memberName: x.member_id ? (memberNames.get(x.member_id) ?? null) : null,
      memberId: x.member_id ?? null,
      category: x.note,
      walletId: x.to_wallet_id,
      walletName: walletName.get(x.to_wallet_id) ?? null,
      note: x.note,
      fromBank: false,
      fromWalletId: x.from_wallet_id,
      toWalletId: x.to_wallet_id,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    balance: state.unaccounted,
    wallets: summaries,
    withdrawn: round(monthTopups.filter((t) => t.source === 'riseup_withdrawal' || t.source === 'manual').reduce((s, t) => s + Number(t.amount_ils), 0)),
    income: round(monthTopups.filter((t) => t.source === 'cash_income').reduce((s, t) => s + Number(t.amount_ils), 0)),
    spent: round(monthSpends.reduce((s, x) => s + Number(x.amount_ils), 0)),
    movements,
  };
}

// ---------------------------------------------------------------------------

function formatUpdated(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(',', '');
}

function uniqueMonths(months: string[], current: string): string[] {
  return [...new Set([...months, current])].sort().reverse().slice(0, 12);
}

function sumBy(items: EnvelopeView[], key: 'actual' | 'expected'): number {
  return items.reduce((total, item) => total + item[key], 0);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
