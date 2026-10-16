import { incomeKindOf, isIncomeKind } from '@/lib/cash/income-kinds';
import { previousMonths } from '@/lib/cash/inflow';
import { db } from '@/lib/db/client';
import type { CashTopup } from '@/lib/types';

/**
 * What a cash income's kind means for what is expected next (V4-08). Not a
 * server action: callers check the session first.
 *
 * Fixed income is expected again every month, so it is tied to a monthly
 * expected-income plan (money.cash_plans) — an existing one with the same
 * category if there is one, else a new one starting this month that this
 * income already settles. Next month the plan shows as "צפוי להיכנס" until
 * an income settles it.
 *
 * When an income stops being fixed, its plan stops expecting: a plan made
 * for it this month goes away; an older one ends with this month (or, for
 * non-cashflow money, the month before, so nothing is left pending).
 */

type Before = Pick<CashTopup, 'income_kind' | 'plan_id'> | null;

export async function applyIncomeKind(topupId: string, before: Before): Promise<void> {
  const supabase = db();
  const { data } = await supabase
    .from('cash_topups')
    .select('id, amount_ils, occurred_at, category, note, member_id, wallet_id, plan_id, income_kind, source')
    .eq('id', topupId)
    .maybeSingle();
  const row = data as (CashTopup & { plan_id: string | null }) | null;
  if (!row || row.source !== 'cash_income' || !isIncomeKind(row.income_kind)) return;

  const month = row.occurred_at.slice(0, 7);
  const was = before ? incomeKindOf(before) : 'variable';
  const now = row.income_kind;

  if (now === 'fixed') {
    // Already fixed and tied to its plan: an edit of the amount or date
    // leaves the plan as the couple last set it.
    if (was === 'fixed' && row.plan_id) return;
    if (row.plan_id) {
      // Fixed again after being switched off: the plan expects again.
      await supabase.from('cash_plans').update({ is_active: true, ends_month: null, updated_at: new Date().toISOString() }).eq('id', row.plan_id);
      return;
    }
    const planId = (await matchingPlan(row.category, month)) ?? (await createPlan(row, month));
    if (planId) await supabase.from('cash_topups').update({ plan_id: planId }).eq('id', row.id);
    return;
  }

  if (was !== 'fixed' || !row.plan_id) return;
  const { data: plan } = await supabase.from('cash_plans').select('id, starts_month, recurrence').eq('id', row.plan_id).maybeSingle();
  if (!plan || plan.recurrence !== 'monthly') return;
  const stamp = new Date().toISOString();
  if ((plan.starts_month as string) >= month) {
    await supabase.from('cash_plans').update({ is_active: false, updated_at: stamp }).eq('id', plan.id);
    await supabase.from('cash_topups').update({ plan_id: null }).eq('id', row.id);
  } else if (now === 'non_cashflow') {
    await supabase.from('cash_plans').update({ ends_month: previousMonths(month, 1)[0], updated_at: stamp }).eq('id', plan.id);
    await supabase.from('cash_topups').update({ plan_id: null }).eq('id', row.id);
  } else {
    await supabase.from('cash_plans').update({ ends_month: month, updated_at: stamp }).eq('id', plan.id);
  }
}

/** An active monthly income plan with this category that runs this month. */
async function matchingPlan(category: string | null, month: string): Promise<string | null> {
  if (!category?.trim()) return null;
  const { data } = await db()
    .from('cash_plans')
    .select('id, starts_month, ends_month')
    .eq('kind', 'income')
    .eq('recurrence', 'monthly')
    .eq('is_active', true)
    .eq('category', category.trim())
    .lte('starts_month', month)
    .order('created_at');
  const live = ((data ?? []) as { id: string; ends_month: string | null }[]).find((p) => p.ends_month === null || p.ends_month >= month);
  return live?.id ?? null;
}

async function createPlan(row: CashTopup, month: string): Promise<string | null> {
  const { data, error } = await db()
    .from('cash_plans')
    .insert({
      kind: 'income',
      amount_ils: Number(row.amount_ils),
      category: row.category?.trim() || 'הכנסה במזומן',
      note: row.note,
      day_of_month: Number(row.occurred_at.slice(8, 10)),
      recurrence: 'monthly',
      starts_month: month,
      wallet_id: row.wallet_id,
      member_id: row.member_id,
    })
    .select('id')
    .single();
  if (error) {
    console.error('Creating the plan for a fixed cash income failed:', error.message);
    return null;
  }
  return data.id as string;
}
