'use server';

import { revalidatePath } from 'next/cache';

import { SESSION_EXPIRED_MESSAGE, sessionMember } from '@/lib/auth/member';
import { monthEnvelopeRefs, settlePlanOccurrence, skipPlanOccurrence } from '@/lib/cash/plan-store';
import type { PlanKind } from '@/lib/cash/plans';
import { db } from '@/lib/db/client';

/**
 * Expected cash from the dashboard: set up a plan, change it, stop it, skip a
 * month, or mark this month's occurrence as paid — which records the real
 * entry and links it, so the pending row turns into an ordinary cash row.
 */

export interface PlanInput {
  kind: PlanKind;
  amountIls: number;
  category: string;
  note: string | null;
  /** An envelope from the month being viewed; stored as type + name, since ids are per month. */
  envelopeId: string | null;
  dayOfMonth: number;
  recurrence: 'monthly' | 'once';
  startsMonth: string;
  endsMonth: string | null;
  walletId: string | null;
  memberId: string | null;
}

export type PlanResult = { ok: true; id: string } | { ok: false; error: string };

const DASHBOARD = '/dashboard';
const MONTH = /^\d{4}-\d{2}$/;

function fail(error: string): PlanResult {
  return { ok: false, error };
}

function dbFail(error: { message: string }): PlanResult {
  console.error('Plan action failed:', error.message);
  return fail('משהו השתבש בשמירה. נסו שוב בעוד רגע.');
}

function validate(input: PlanInput): string | null {
  if (!Number.isFinite(input.amountIls) || input.amountIls <= 0) return 'צריך סכום גדול מאפס.';
  if (!input.category.trim()) return 'צריך קטגוריה.';
  if (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 31) return 'יום בחודש בין 1 ל-31.';
  if (!MONTH.test(input.startsMonth)) return 'חודש התחלה לא תקין.';
  if (input.endsMonth && (!MONTH.test(input.endsMonth) || input.endsMonth < input.startsMonth)) {
    return 'חודש הסיום צריך להיות אחרי חודש ההתחלה.';
  }
  return null;
}

async function toRow(input: PlanInput) {
  let envelopeType: string | null = null;
  let envelopeName: string | null = null;
  if (input.kind === 'spend' && input.envelopeId) {
    const ref = (await monthEnvelopeRefs(input.startsMonth)).find((r) => r.envelopeId === input.envelopeId);
    if (ref && ref.type !== 'variableIncome') {
      envelopeType = ref.type;
      envelopeName = ref.type === 'trackingCategory' ? ref.name : null;
    }
  }
  return {
    kind: input.kind,
    amount_ils: input.amountIls,
    category: input.category.trim(),
    note: input.note?.trim() || null,
    envelope_type: envelopeType,
    envelope_name: envelopeName,
    day_of_month: input.dayOfMonth,
    recurrence: input.recurrence,
    starts_month: input.startsMonth,
    ends_month: input.recurrence === 'once' ? null : input.endsMonth,
    wallet_id: input.walletId,
    member_id: input.memberId,
  };
}

export async function createPlan(input: PlanInput): Promise<PlanResult> {
  if (!(await sessionMember())) return fail(SESSION_EXPIRED_MESSAGE);
  const problem = validate(input);
  if (problem) return fail(problem);

  const { data, error } = await db().from('cash_plans').insert(await toRow(input)).select('id').single();
  if (error) return dbFail(error);
  revalidatePath(DASHBOARD);
  return { ok: true, id: data.id as string };
}

export async function updatePlan(id: string, input: PlanInput): Promise<PlanResult> {
  if (!(await sessionMember())) return fail(SESSION_EXPIRED_MESSAGE);
  const problem = validate(input);
  if (problem) return fail(problem);

  const { error } = await db()
    .from('cash_plans')
    .update({ ...(await toRow(input)), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return dbFail(error);
  revalidatePath(DASHBOARD);
  return { ok: true, id };
}

/**
 * Stop a plan from this month on. Past months keep their occurrences, so an
 * old month's forecast does not rewrite itself.
 */
export async function stopPlan(id: string, fromMonth: string): Promise<PlanResult> {
  if (!(await sessionMember())) return fail(SESSION_EXPIRED_MESSAGE);
  if (!MONTH.test(fromMonth)) return fail('חודש לא תקין.');
  const supabase = db();
  const { data: plan } = await supabase.from('cash_plans').select('*').eq('id', id).maybeSingle();
  if (!plan) return fail('התכנון לא נמצא.');

  const [y, m] = fromMonth.split('-').map(Number);
  const previous = new Date(Date.UTC(y!, m! - 2, 1)).toISOString().slice(0, 7);
  // Started this month or later: nothing to keep, so switch it off entirely.
  const patch =
    previous < (plan.starts_month as string)
      ? { is_active: false }
      : { ends_month: previous, recurrence: 'monthly' };

  const { error } = await supabase
    .from('cash_plans')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return dbFail(error);
  revalidatePath(DASHBOARD);
  return { ok: true, id };
}

/** "Not this month." */
export async function skipPlanMonth(id: string, month: string): Promise<PlanResult> {
  if (!(await sessionMember())) return fail(SESSION_EXPIRED_MESSAGE);
  if (!MONTH.test(month)) return fail('חודש לא תקין.');
  try {
    await skipPlanOccurrence(id, month);
  } catch (error) {
    return dbFail({ message: error instanceof Error ? error.message : String(error) });
  }
  revalidatePath(DASHBOARD);
  return { ok: true, id };
}

export async function unskipPlanMonth(id: string, month: string): Promise<PlanResult> {
  if (!(await sessionMember())) return fail(SESSION_EXPIRED_MESSAGE);
  const { error } = await db().from('cash_plan_skips').delete().eq('plan_id', id).eq('month', month);
  if (error) return dbFail(error);
  revalidatePath(DASHBOARD);
  return { ok: true, id };
}

/**
 * "שולם" / "התקבל": record the real entry for this month's occurrence. The
 * amount defaults to the plan's; a different amount is the truth and replaces
 * it in the forecast.
 */
export async function settlePlan(id: string, month: string, amountIls?: number): Promise<PlanResult> {
  const signedIn = await sessionMember();
  if (!signedIn) return fail(SESSION_EXPIRED_MESSAGE);
  if (!MONTH.test(month)) return fail('חודש לא תקין.');
  try {
    const result = await settlePlanOccurrence(id, month, signedIn, amountIls);
    if (!result.ok) return fail(result.error);
    revalidatePath(DASHBOARD);
    return { ok: true, id: result.id };
  } catch (error) {
    return dbFail({ message: error instanceof Error ? error.message : String(error) });
  }
}
