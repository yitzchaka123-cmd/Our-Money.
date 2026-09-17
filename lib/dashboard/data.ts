import { envelopeChoices, resolveEnvelopeForCategory, type EnvelopeRef } from '@/lib/cash/envelopes';
import { db } from '@/lib/db/client';
import { isoDateInIsrael } from '@/lib/intake/parse';
import { monthBounds, walletState } from '@/lib/reconcile';
import {
  ENVELOPE_TITLES,
  sortEnvelopes,
  type NormalizedActual,
  type NormalizedEnvelope,
} from '@/lib/riseup/envelopes';
import { matchesWithdrawalName } from '@/lib/riseup/withdrawals';
import type { CashSpend, CashTopup, EnvelopeType, HouseholdMember } from '@/lib/types';

export interface EnvelopeView {
  key: string;
  envelopeId: string | null;
  type: EnvelopeType;
  title: string;
  actual: number;
  expected: number;
  actuals: NormalizedActual[];
  showRemaining: boolean;
}

export interface WalletMovement {
  id: string;
  kind: 'withdrawal' | 'income' | 'spend';
  amountIls: number;
  date: string;
  label: string;
  memberName: string | null;
  category: string | null;
}

export interface WalletView {
  /** All-time: withdrawals + cash income − cash spends. What should be in the wallet now. */
  balance: number;
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
  /** Expected income minus every expected expense — RiseUp's headline number. */
  forecast: number;
  variableRemaining: number;
  totalActualExpenses: number;
  totalExpectedExpenses: number;
  envelopes: EnvelopeView[];
  /** What the cash-entry picker offers. */
  envelopeChoices: EnvelopeRef[];
  wallet: WalletView;
  members: Pick<HouseholdMember, 'id' | 'display_name'>[];
  briefCount: number;
}

const EXPENSE_TYPES = new Set<EnvelopeType>(['variable', 'fixed', 'trackingCategory', 'riseupGoal']);
const INCOME_TYPES = new Set<EnvelopeType>(['variableIncome', 'cashIncome']);

export function currentMonth(): string {
  return isoDateInIsrael().slice(0, 7);
}

export async function loadDashboard(month: string): Promise<DashboardData> {
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
    { data: syncRuns },
    { data: monthList },
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
    supabase.from('household_members').select('id, display_name'),
    supabase
      .from('sync_runs')
      .select('finished_at')
      .eq('status', 'succeeded')
      .order('finished_at', { ascending: false })
      .limit(1),
    supabase.from('riseup_envelopes').select('month'),
  ]);

  const memberList = (members ?? []) as Pick<HouseholdMember, 'id' | 'display_name'>[];
  const memberNames = new Map(memberList.map((m) => [m.id, m.display_name]));

  const actualsByEnvelope = groupActuals(actualRows ?? []);
  const riseupEnvelopes = (envelopeRows ?? []).map((row) => toNormalized(row, actualsByEnvelope));

  const spends = (monthSpends ?? []) as CashSpend[];
  const topups = (monthTopups ?? []) as CashTopup[];

  const merged = mergeCashIntoEnvelopes(riseupEnvelopes, spends, memberNames);
  const cashIncome = cashIncomeEnvelope(topups, memberNames);
  const envelopes = sortEnvelopes([...merged, ...(cashIncome ? [cashIncome] : [])]).map(toView);

  const income = sumBy(envelopes.filter((e) => INCOME_TYPES.has(e.type)), 'expected');
  const expectedExpenses = sumBy(envelopes.filter((e) => EXPENSE_TYPES.has(e.type)), 'expected');
  const actualExpenses = sumBy(envelopes.filter((e) => EXPENSE_TYPES.has(e.type)), 'actual');
  const variable = envelopes.find((e) => e.type === 'variable');

  const lastSyncAt = (syncRuns?.[0]?.finished_at as string | undefined) ?? null;

  return {
    month,
    months: uniqueMonths(
      ((monthList ?? []) as { month: string }[]).map((row) => row.month),
      month,
    ),
    userName: memberList[0]?.display_name ?? 'שלום',
    greeting: (memberList[0]?.display_name ?? '').split(' ')[0] || 'שלום',
    lastUpdated: formatUpdated(lastSyncAt),
    lastSyncAt,
    forecast: round(income - expectedExpenses),
    variableRemaining: variable ? round(Math.max(variable.expected - variable.actual, 0)) : 0,
    totalActualExpenses: round(actualExpenses),
    totalExpectedExpenses: round(expectedExpenses),
    envelopes,
    envelopeChoices: envelopeChoices(riseupEnvelopes.map(toRef)),
    wallet: buildWallet(
      (allTopups ?? []) as CashTopup[],
      (allSpends ?? []) as CashSpend[],
      topups,
      spends,
      memberNames,
    ),
    members: memberList,
    briefCount: spends.filter((s) => s.status === 'needs_review').length,
  };
}

// ---------------------------------------------------------------------------
// RiseUp rows → normalized envelopes
// ---------------------------------------------------------------------------

interface ActualRow {
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

function groupActuals(rows: ActualRow[]): Map<string, NormalizedActual[]> {
  const grouped = new Map<string, NormalizedActual[]>();
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
        source: row.source,
        isInstallment: row.is_installment,
        paymentNumber: row.payment_number,
        totalPayments: row.total_payments,
        categoryLabel: row.category_label,
      },
    ]);
  }
  return grouped;
}

interface EnvelopeRow {
  envelope_id: string;
  envelope_type: string;
  name: string | null;
  planned_ils: number | string;
  position: number;
}

function toNormalized(
  row: EnvelopeRow,
  actualsByEnvelope: Map<string, NormalizedActual[]>,
): NormalizedEnvelope {
  const actuals = actualsByEnvelope.get(row.envelope_id) ?? [];
  const type = row.envelope_type as EnvelopeType;
  return {
    envelopeId: row.envelope_id,
    type,
    name: row.name ?? ENVELOPE_TITLES[type] ?? row.envelope_id,
    plannedIls: Number(row.planned_ils),
    actualIls: round(actuals.reduce((sum, a) => sum + a.amountIls, 0)),
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
        envelope.actuals.map((a) => a.categoryLabel).filter((l): l is string => Boolean(l)),
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
  };
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
): NormalizedEnvelope[] {
  const byId = new Map(envelopes.map((e) => [e.envelopeId, cloneEnvelope(e)]));
  const refs = envelopes.map(toRef);

  for (const spend of spends) {
    let target =
      (spend.envelope_id && byId.get(spend.envelope_id)) ||
      pickById(byId, resolveEnvelopeForCategory(refs, spend.category)?.envelopeId);

    // Before the first sync there is nothing to file into. Rather than lose the
    // entry, stand up the variable envelope RiseUp would have given it.
    if (!target) {
      target = byId.get(FALLBACK_VARIABLE_ID) ?? {
        envelopeId: FALLBACK_VARIABLE_ID,
        type: 'variable',
        name: ENVELOPE_TITLES.variable ?? 'הוצאות משתנות',
        plannedIls: 0,
        actualIls: 0,
        position: 0,
        actuals: [],
      };
      byId.set(FALLBACK_VARIABLE_ID, target);
    }

    target.actuals.push(spendToActual(spend, memberNames));
  }

  return [...byId.values()].map((e) => ({
    ...e,
    actualIls: round(e.actuals.reduce((sum, a) => sum + a.amountIls, 0)),
  }));
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
      memberName: memberNames.get(spend.member_id) ?? null,
      inputKind: spend.input_kind,
      status: spend.status === 'needs_review' ? 'needs_review' : 'confirmed',
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
      memberName: topup.member_id ? (memberNames.get(topup.member_id) ?? null) : null,
      inputKind: topup.input_kind ?? 'text',
      status: 'confirmed',
    },
  };
}

/** Cash received this month, as an envelope beside RiseUp's own income. */
function cashIncomeEnvelope(
  topups: CashTopup[],
  memberNames: Map<string, string>,
): NormalizedEnvelope | null {
  const incomes = topups.filter((t) => t.source === 'cash_income');
  if (incomes.length === 0) return null;
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

function buildWallet(
  allTopups: CashTopup[],
  allSpends: CashSpend[],
  monthTopups: CashTopup[],
  monthSpends: CashSpend[],
  memberNames: Map<string, string>,
): WalletView {
  const state = walletState(allTopups, allSpends);

  const movements: WalletMovement[] = [
    ...monthTopups.map((t): WalletMovement => ({
      id: t.id,
      kind: t.source === 'cash_income' ? 'income' : 'withdrawal',
      amountIls: Number(t.amount_ils),
      date: t.occurred_at,
      label:
        t.source === 'cash_income'
          ? t.note || t.category || 'הכנסה במזומן'
          : t.business_name || 'משיכת מזומן',
      memberName: t.member_id ? (memberNames.get(t.member_id) ?? null) : null,
      category: t.category,
    })),
    ...monthSpends.map((s): WalletMovement => ({
      id: s.id,
      kind: 'spend',
      amountIls: Number(s.amount_ils),
      date: s.spent_at,
      label: s.note || s.category,
      memberName: memberNames.get(s.member_id) ?? null,
      category: s.category,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    balance: state.unaccounted,
    withdrawn: round(
      monthTopups.filter((t) => t.source !== 'cash_income').reduce((s, t) => s + Number(t.amount_ils), 0),
    ),
    income: round(
      monthTopups.filter((t) => t.source === 'cash_income').reduce((s, t) => s + Number(t.amount_ils), 0),
    ),
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
