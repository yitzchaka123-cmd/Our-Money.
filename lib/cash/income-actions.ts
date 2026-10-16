'use server';

import { revalidatePath } from 'next/cache';

import { SESSION_EXPIRED_MESSAGE, sessionMember } from '@/lib/auth/member';
import { applyIncomeKind } from '@/lib/cash/income-kind-store';
import { isIncomeKind, type IncomeKind } from '@/lib/cash/income-kinds';
import { db } from '@/lib/db/client';

export type IncomeKindResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * RiseUp's "איזו הכנסה זו?" for a cash income: its kind (משתנה / קבועה /
 * לא תזרימית) and its category. Our own rows, so this is a real edit.
 */
export async function setCashIncomeKind(id: string, kind: IncomeKind, category: string): Promise<IncomeKindResult> {
  if (!(await sessionMember())) return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  if (!isIncomeKind(kind)) return { ok: false, error: 'סוג הכנסה לא מוכר.' };
  const name = category.trim();
  if (!name) return { ok: false, error: 'צריך קטגוריה.' };
  if (name.length > 40) return { ok: false, error: 'שם הקטגוריה ארוך מדי.' };

  const supabase = db();
  const { data: before } = await supabase
    .from('cash_topups')
    .select('income_kind, plan_id')
    .eq('id', id)
    .eq('source', 'cash_income')
    .maybeSingle();
  if (!before) return { ok: false, error: 'ההכנסה לא נמצאה.' };

  const { error } = await supabase
    .from('cash_topups')
    .update({ income_kind: kind, category: name, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error('Setting a cash income kind failed:', error.message);
    return { ok: false, error: 'משהו השתבש בשמירה. נסו שוב בעוד רגע.' };
  }
  await applyIncomeKind(id, before);
  revalidatePath('/dashboard');
  revalidatePath('/daily');
  return { ok: true, id };
}
