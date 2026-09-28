import {
  occurrenceDate,
  occursIn,
  planEnvelope,
  planOccurrences,
  type CashPlan,
  type PlanOccurrence,
} from '@/lib/cash/plans';
import { isoDateInIsrael } from '@/lib/dates';
import { db } from '@/lib/db/client';
import { envelopeRefsForMonth } from '@/lib/db/queries';

/**
 * Plan persistence shared by the dashboard's server actions and the bot's
 * buttons. Callers are responsible for having checked who is asking.
 */

export const monthEnvelopeRefs = envelopeRefsForMonth;

export async function loadPlan(id: string): Promise<CashPlan | null> {
  const { data } = await db().from('cash_plans').select('*').eq('id', id).maybeSingle();
  return data ? { ...(data as CashPlan), amount_ils: Number(data.amount_ils) } : null;
}

export type SettleResult =
  | { ok: true; id: string; plan: CashPlan; amountIls: number }
  | { ok: false; error: string };

/**
 * Record the real entry for a plan's occurrence in `month`, linked to the
 * plan so the pending row turns into an ordinary cash row. Dated today for
 * the current month, otherwise on the plan's day in that month. Refuses a
 * second settlement of the same month, so a double tap cannot pay twice.
 */
export async function settlePlanOccurrence(
  planId: string,
  month: string,
  actingMemberId: string,
  amountIls?: number,
  today = isoDateInIsrael(),
): Promise<SettleResult> {
  const plan = await loadPlan(planId);
  if (!plan) return { ok: false, error: 'התכנון לא נמצא.' };
  if (!occursIn(plan, month)) return { ok: false, error: 'התכנון לא פעיל בחודש הזה.' };

  const amount = amountIls ?? plan.amount_ils;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'צריך סכום גדול מאפס.' };

  const supabase = db();
  const [from, to] = [`${month}-01`, occurrenceDate(31, month)];
  const table = plan.kind === 'income' ? 'cash_topups' : 'cash_spends';
  const dateColumn = plan.kind === 'income' ? 'occurred_at' : 'spent_at';
  let existing = supabase.from(table).select('id', { count: 'exact', head: true }).eq('plan_id', plan.id).gte(dateColumn, from).lte(dateColumn, to);
  existing = plan.kind === 'income' ? existing.eq('is_dismissed', false) : existing.neq('status', 'deleted');
  const { count } = await existing;
  if ((count ?? 0) > 0) return { ok: false, error: 'כבר נרשם החודש.' };

  const date = today.startsWith(month) ? today : occurrenceDate(plan.day_of_month, month);
  const memberId = plan.member_id ?? actingMemberId;

  if (plan.kind === 'income') {
    const { data, error } = await supabase
      .from('cash_topups')
      .insert({
        amount_ils: amount,
        occurred_at: date,
        source: 'cash_income',
        category: plan.category,
        note: plan.note,
        member_id: memberId,
        input_kind: 'web',
        wallet_id: plan.wallet_id,
        plan_id: plan.id,
      })
      .select('id')
      .single();
    if (error) throw new Error(`Failed to settle a plan: ${error.message}`);
    return { ok: true, id: data.id as string, plan, amountIls: amount };
  }

  const target = planEnvelope(plan, await monthEnvelopeRefs(month));
  const { data, error } = await supabase
    .from('cash_spends')
    .insert({
      member_id: memberId,
      amount_ils: amount,
      category: target?.type === 'trackingCategory' ? target.name : plan.category,
      note: plan.note,
      spent_at: date,
      status: 'confirmed',
      confidence: 'high',
      input_kind: 'web',
      wallet_id: plan.wallet_id,
      envelope_id: target?.envelopeId ?? null,
      envelope_type: target?.type ?? null,
      plan_id: plan.id,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to settle a plan: ${error.message}`);
  return { ok: true, id: data.id as string, plan, amountIls: amount };
}

export async function skipPlanOccurrence(planId: string, month: string): Promise<void> {
  const { error } = await db()
    .from('cash_plan_skips')
    .upsert({ plan_id: planId, month }, { onConflict: 'plan_id,month' });
  if (error) throw new Error(`Failed to skip a plan month: ${error.message}`);
}

/** This month's occurrences still waiting whose day has come. */
export async function duePlans(today = isoDateInIsrael()): Promise<Array<{ plan: CashPlan; occurrence: PlanOccurrence }>> {
  const month = today.slice(0, 7);
  const supabase = db();
  const [plans, skips, spends, topups] = await Promise.all([
    supabase.from('cash_plans').select('*').eq('is_active', true),
    supabase.from('cash_plan_skips').select('plan_id').eq('month', month),
    supabase
      .from('cash_spends')
      .select('id, plan_id, amount_ils, spent_at')
      .not('plan_id', 'is', null)
      .neq('status', 'deleted')
      .gte('spent_at', `${month}-01`),
    supabase
      .from('cash_topups')
      .select('id, plan_id, amount_ils, occurred_at')
      .not('plan_id', 'is', null)
      .eq('is_dismissed', false)
      .gte('occurred_at', `${month}-01`),
  ]);

  const list = ((plans.data ?? []) as CashPlan[]).map((p) => ({ ...p, amount_ils: Number(p.amount_ils) }));
  const settlements = [
    ...(spends.data ?? []).map((s) => ({ planId: s.plan_id as string, entryId: s.id as string, amountIls: Number(s.amount_ils), date: s.spent_at as string })),
    ...(topups.data ?? []).map((t) => ({ planId: t.plan_id as string, entryId: t.id as string, amountIls: Number(t.amount_ils), date: t.occurred_at as string })),
  ];
  const occurrences = planOccurrences(list, month, settlements, new Set((skips.data ?? []).map((s) => s.plan_id as string)));
  const byId = new Map(list.map((p) => [p.id, p]));

  return occurrences
    .filter((o) => o.status === 'pending' && o.date <= today)
    .map((occurrence) => ({ plan: byId.get(occurrence.planId)!, occurrence }));
}
