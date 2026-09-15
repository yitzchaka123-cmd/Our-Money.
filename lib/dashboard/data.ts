import { db } from '@/lib/db/client';
import { isoDateInIsrael } from '@/lib/intake/parse';
import { monthBounds, walletState, type WalletState } from '@/lib/reconcile';
import {
  ENVELOPE_TITLES,
  sortEnvelopes,
  type NormalizedActual,
  type NormalizedEnvelope,
} from '@/lib/riseup/envelopes';
import { matchesWithdrawalName } from '@/lib/riseup/withdrawals';
import type { CashSpend, CashTopup, EnvelopeType } from '@/lib/types';

export interface EnvelopeView {
  key: string;
  type: EnvelopeType;
  title: string;
  actual: number;
  expected: number;
  actuals: NormalizedActual[];
  showRemaining: boolean;
}

export interface DashboardData {
  month: string;
  months: string[];
  userName: string;
  greeting: string;
  lastUpdated: string | null;
  /** Expected income minus every expected expense — RiseUp's headline number. */
  forecast: number;
  variableRemaining: number;
  totalActualExpenses: number;
  totalExpectedExpenses: number;
  envelopes: EnvelopeView[];
  wallet: WalletState;
  briefCount: number;
}

const EXPENSE_TYPES = new Set<EnvelopeType>([
  'variable',
  'fixed',
  'trackingCategory',
  'riseupGoal',
  'cash',
  'cashUnlogged',
]);

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
      .lte('occurred_at', to),
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

  const memberNames = new Map(
    (members ?? []).map((m) => [m.id as string, m.display_name as string]),
  );

  const actualsByEnvelope = groupActuals(actualRows ?? []);
  const riseupEnvelopes = sortEnvelopes(
    (envelopeRows ?? []).map((row) => toNormalized(row, actualsByEnvelope)),
  );

  const spends = (monthSpends ?? []) as CashSpend[];
  const topups = (monthTopups ?? []) as CashTopup[];

  const envelopes = [
    ...riseupEnvelopes.map(toView),
    ...cashEnvelopes(spends, topups, memberNames),
  ];

  const income = sumBy(envelopes.filter((e) => e.type === 'variableIncome'), 'expected');
  const expectedExpenses = sumBy(
    envelopes.filter((e) => EXPENSE_TYPES.has(e.type)),
    'expected',
  );
  const actualExpenses = sumBy(
    envelopes.filter((e) => EXPENSE_TYPES.has(e.type)),
    'actual',
  );

  const variable = envelopes.find((e) => e.type === 'variable');

  return {
    month,
    months: uniqueMonths(
      ((monthList ?? []) as { month: string }[]).map((row) => row.month),
      month,
    ),
    userName: [...memberNames.values()][0] ?? 'שלום',
    greeting: ([...memberNames.values()][0] ?? '').split(' ')[0] || 'שלום',
    lastUpdated: formatUpdated(syncRuns?.[0]?.finished_at as string | undefined),
    forecast: round(income - expectedExpenses),
    variableRemaining: variable ? round(Math.max(variable.expected - variable.actual, 0)) : 0,
    totalActualExpenses: round(actualExpenses),
    totalExpectedExpenses: round(expectedExpenses),
    envelopes,
    wallet: walletState((allTopups ?? []) as CashTopup[], (allSpends ?? []) as CashSpend[]),
    briefCount: spends.filter((s) => s.status === 'needs_review').length,
  };
}

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
    // An ATM withdrawal is cash changing location, not spending. The cash
    // envelope accounts for that money instead, so it is dropped here to avoid
    // counting it twice.
    if (matchesWithdrawalName(row.business_name)) continue;

    const actual: NormalizedActual = {
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
    };
    grouped.set(row.envelope_id, [...(grouped.get(row.envelope_id) ?? []), actual]);
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
  return {
    envelopeId: row.envelope_id,
    type: row.envelope_type as EnvelopeType,
    name: row.name ?? ENVELOPE_TITLES[row.envelope_type as EnvelopeType] ?? row.envelope_id,
    plannedIls: Number(row.planned_ils),
    // Recomputed after withdrawals are dropped, so the card and its breakdown
    // can never disagree.
    actualIls: round(actuals.reduce((sum, a) => sum + a.amountIls, 0)),
    position: row.position,
    actuals,
  };
}

function toView(envelope: NormalizedEnvelope): EnvelopeView {
  return {
    key: envelope.envelopeId,
    type: envelope.type,
    title: envelope.name,
    actual: envelope.actualIls,
    expected: envelope.plannedIls,
    actuals: envelope.actuals,
    showRemaining:
      envelope.type === 'trackingCategory' || envelope.type === 'riseupGoal',
  };
}

/**
 * Cash rendered as RiseUp envelopes: one for what was logged, and — only when
 * the wallet does not reconcile — one for what is still unaccounted for.
 */
function cashEnvelopes(
  spends: CashSpend[],
  topups: CashTopup[],
  memberNames: Map<string, string>,
): EnvelopeView[] {
  const logged = round(spends.reduce((sum, s) => sum + Number(s.amount_ils), 0));
  const withdrawn = round(topups.reduce((sum, t) => sum + Number(t.amount_ils), 0));

  if (logged === 0 && withdrawn === 0) return [];

  const envelopes: EnvelopeView[] = [
    {
      key: 'cash',
      type: 'cash',
      title: ENVELOPE_TITLES.cash ?? 'מזומן',
      actual: logged,
      expected: withdrawn,
      actuals: spends.map(spendToActual(memberNames)),
      showRemaining: true,
    },
  ];

  const unlogged = round(withdrawn - logged);
  if (unlogged > 0) {
    envelopes.push({
      key: 'cash-unlogged',
      type: 'cashUnlogged',
      title: ENVELOPE_TITLES.cashUnlogged ?? 'מזומן שטרם נרשם',
      actual: unlogged,
      expected: unlogged,
      actuals: [],
      showRemaining: false,
    });
  }

  return envelopes;
}

function spendToActual(memberNames: Map<string, string>) {
  return (spend: CashSpend): NormalizedActual => ({
    transactionId: spend.id,
    transactionDate: spend.spent_at,
    billingDate: spend.spent_at,
    businessName: spend.note || spend.category,
    amountIls: Number(spend.amount_ils),
    isIncome: false,
    accountNickname: memberNames.get(spend.member_id) ?? null,
    accountNumberHash: null,
    source: spend.input_kind === 'voice' ? 'voice' : 'text',
    isInstallment: false,
    paymentNumber: null,
    totalPayments: null,
    categoryLabel: spend.category,
  });
}

function formatUpdated(iso: string | undefined): string | null {
  if (!iso) return null;
  const formatted = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
  // he-IL gives "15.09, 7:36"; RiseUp writes "15.09 7:36".
  return formatted.replace(',', '');
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
