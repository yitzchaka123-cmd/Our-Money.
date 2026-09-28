import { resolveEnvelopeForCategory, type EnvelopeRef } from '@/lib/cash/envelopes';
import type { EnvelopeType } from '@/lib/types';

/**
 * Expected cash — the cash twin of RiseUp's predicted transactions. A plan is
 * "800 to the cleaner, in cash, around the 10th of every month"; each month it
 * produces one occurrence that is pending until a real entry settles it.
 */

export type PlanKind = 'spend' | 'income';
export type PlanEnvelopeType = Extract<EnvelopeType, 'variable' | 'fixed' | 'trackingCategory' | 'riseupGoal'>;

export interface CashPlan {
  id: string;
  kind: PlanKind;
  amount_ils: number;
  category: string;
  note: string | null;
  envelope_type: PlanEnvelopeType | null;
  envelope_name: string | null;
  day_of_month: number;
  recurrence: 'monthly' | 'once';
  starts_month: string;
  ends_month: string | null;
  wallet_id: string | null;
  member_id: string | null;
  is_active: boolean;
}

/** An entry recorded against a plan. */
export interface PlanSettlement {
  planId: string;
  entryId: string;
  amountIls: number;
  date: string;
}

export interface PlanOccurrence {
  planId: string;
  kind: PlanKind;
  /** The plan's amount, or what was actually paid once settled. */
  amountIls: number;
  plannedIls: number;
  date: string;
  category: string;
  note: string | null;
  walletId: string | null;
  memberId: string | null;
  recurrence: 'monthly' | 'once';
  status: 'pending' | 'settled';
  settledEntryIds: string[];
}

/** Whether a plan has an occurrence in this month at all. */
export function occursIn(plan: CashPlan, month: string): boolean {
  if (!plan.is_active) return false;
  if (month < plan.starts_month) return false;
  if (plan.recurrence === 'once') return month === plan.starts_month;
  return plan.ends_month === null || month <= plan.ends_month;
}

/** The plan's day in this month, clamped: "the 31st" in February is the 28th. */
export function occurrenceDate(dayOfMonth: number, month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  const day = Math.min(Math.max(dayOfMonth, 1), lastDay);
  return `${month}-${String(day).padStart(2, '0')}`;
}

/**
 * The month's occurrences. A skipped month yields nothing; a settled one
 * carries what was really paid, since that — not the plan — is the truth.
 */
export function planOccurrences(
  plans: CashPlan[],
  month: string,
  settlements: PlanSettlement[],
  skippedPlanIds: ReadonlySet<string>,
): PlanOccurrence[] {
  const inMonth = settlements.filter((s) => s.date.startsWith(month));

  return plans
    .filter((plan) => occursIn(plan, month) && !skippedPlanIds.has(plan.id))
    .map((plan): PlanOccurrence => {
      const settled = inMonth.filter((s) => s.planId === plan.id);
      const paid = round(settled.reduce((sum, s) => sum + s.amountIls, 0));
      return {
        planId: plan.id,
        kind: plan.kind,
        amountIls: settled.length > 0 ? paid : Number(plan.amount_ils),
        plannedIls: Number(plan.amount_ils),
        date: occurrenceDate(plan.day_of_month, month),
        category: plan.category,
        note: plan.note,
        walletId: plan.wallet_id,
        memberId: plan.member_id,
        recurrence: plan.recurrence,
        status: settled.length > 0 ? 'settled' : 'pending',
        settledEntryIds: settled.map((s) => s.entryId),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Which of this month's envelopes a spend plan files into: a named tracker if
 * it still exists, else the first envelope of the remembered type, else
 * wherever its category would send a real spend.
 */
export function planEnvelope(
  plan: Pick<CashPlan, 'envelope_type' | 'envelope_name' | 'category'>,
  envelopes: EnvelopeRef[],
): EnvelopeRef | null {
  if (plan.envelope_type === 'trackingCategory' && plan.envelope_name) {
    const tracker = envelopes.find(
      (e) => e.type === 'trackingCategory' && e.name.trim() === plan.envelope_name!.trim(),
    );
    if (tracker) return tracker;
  } else if (plan.envelope_type) {
    const sameType = envelopes.find((e) => e.type === plan.envelope_type);
    if (sameType) return sameType;
  }
  return resolveEnvelopeForCategory(envelopes, plan.category);
}

/** What an envelope's figures are built from once cash is in it. */
export interface EnvelopeFigures {
  type: EnvelopeType;
  riseupPlanned: number;
  riseupActual: number;
  /** Every cash entry in the envelope, settled plans included. */
  cashActual: number;
  /** Settled occurrences at what was paid, pending ones at the plan's amount. */
  planCommitted: number;
  /** Occurrences not yet settled. */
  pending: number;
}

/**
 * The envelope's "expected" figure with cash in it.
 *
 * Nothing cash-related → RiseUp's own plan, untouched.
 *
 * Budget envelopes (variable, trackers, savings) are an allowance: cash spent
 * inside the allowance uses it up rather than adding to it, so expected only
 * rises when spending — including what is still planned — breaks through.
 *
 * The fixed envelope is itemised: RiseUp's plan lists specific bank charges,
 * so every cash payment is on top of it.
 *
 * Cash income has no RiseUp plan: expected is what came in plus what is
 * still due.
 */
export function expectedWithCash(figures: EnvelopeFigures): number {
  const { type, riseupPlanned, riseupActual, cashActual, planCommitted, pending } = figures;

  if (type === 'cashIncome') return round(cashActual + pending);
  if (cashActual === 0 && planCommitted === 0) return riseupPlanned;

  if (type === 'fixed') {
    return round(Math.max(riseupPlanned, riseupActual) + cashActual + pending);
  }
  if (type === 'variable' || type === 'trackingCategory' || type === 'riseupGoal') {
    return round(Math.max(riseupPlanned + planCommitted, riseupActual + cashActual + pending));
  }
  // RiseUp's own income envelope never holds cash.
  return riseupPlanned;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
