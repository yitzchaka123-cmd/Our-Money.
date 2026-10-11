import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_FAILURES, issueLoginCode, redeemLoginCode } from '@/lib/auth/codes';
import { addCashEntry } from '@/lib/cash/actions';
import { createPlan, settlePlan, skipPlanMonth, stopPlan, type PlanInput } from '@/lib/cash/plan-actions';
import { duePlans } from '@/lib/cash/plan-store';
import { loadDashboard } from '@/lib/dashboard/data';
import type { RiseupBudget, RiseupTransaction } from '@/lib/types';

import { resetDb, seedMember, seedMonth, signIn, sql } from './helpers';

// RiseUp is the one outside service a sync touches; everything else is real.
const riseup = vi.hoisted(() => ({
  transactions: [] as RiseupTransaction[],
  budget: { envelopes: [] } as RiseupBudget,
}));
vi.mock('@/lib/riseup/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/riseup/client')>();
  return {
    ...original,
    recentMonths: () => ['2026-09'],
    fetchTransactions: async () => riseup.transactions,
    fetchBudget: async () => riseup.budget,
  };
});

const MONTH = '2026-09';
let member: string;

beforeEach(async () => {
  resetDb();
  member = await seedMember(111, 'יצחק');
  await seedMonth(MONTH);
  signIn(member);
  riseup.transactions = [];
  riseup.budget = { envelopes: [] };
});

function planInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    kind: 'spend',
    amountIls: 800,
    category: 'ניקיון',
    note: 'עוזרת בית',
    envelopeId: `${MONTH}-fix`,
    dayOfMonth: 20,
    recurrence: 'monthly',
    startsMonth: MONTH,
    endsMonth: null,
    walletId: null,
    memberId: null,
    ...overrides,
  };
}

describe('expected cash, end to end', () => {
  it('counts a plan in the forecast, settles it once, and keeps the forecast steady', async () => {
    const before = await loadDashboard(MONTH, member);
    const created = await createPlan(planInput());
    if (!created.ok) throw new Error(created.error);

    const pending = await loadDashboard(MONTH, member);
    const fixed = pending.envelopes.find((e) => e.type === 'fixed')!;
    expect(fixed.pending.map((p) => p.amountIls)).toEqual([800]);
    expect(pending.forecast).toBe(before.forecast - 800);

    expect((await settlePlan(created.id, MONTH)).ok).toBe(true);
    // A double tap must not pay twice.
    expect(await settlePlan(created.id, MONTH)).toEqual({ ok: false, error: 'כבר נרשם החודש.' });

    const paid = await loadDashboard(MONTH, member);
    const fixedPaid = paid.envelopes.find((e) => e.type === 'fixed')!;
    expect(fixedPaid.pending).toHaveLength(0);
    expect(fixedPaid.actuals.some((a) => a.cash && a.amountIls === 800)).toBe(true);
    expect(paid.forecast).toBe(pending.forecast);
    expect(sql('select envelope_id, plan_id is not null as linked from cash_spends')).toEqual([
      { envelope_id: `${MONTH}-fix`, linked: true },
    ]);
  });

  it('skips a month, and stopping a plan keeps earlier months intact', async () => {
    const created = await createPlan(planInput({ startsMonth: '2026-07' }));
    if (!created.ok) throw new Error(created.error);
    await skipPlanMonth(created.id, MONTH);
    expect((await loadDashboard(MONTH, member)).envelopes.find((e) => e.type === 'fixed')!.pending).toHaveLength(0);

    await stopPlan(created.id, MONTH);
    expect(sql('select is_active, ends_month from cash_plans')).toEqual([{ is_active: true, ends_month: '2026-08' }]);
  });

  it('lists only plans whose day has come as due for the evening nudge', async () => {
    await createPlan(planInput({ dayOfMonth: 5, note: 'עבר' }));
    await createPlan(planInput({ dayOfMonth: 25, note: 'עוד לא' }));
    const due = await duePlans(`${MONTH}-10`);
    expect(due.map((d) => d.plan.note)).toEqual(['עבר']);
  });

  it('expects cash income from a plan in the cash income envelope', async () => {
    await createPlan(planInput({ kind: 'income', category: 'משכורת במזומן', note: 'שיעורים', amountIls: 1200, envelopeId: null }));
    const data = await loadDashboard(MONTH, member);
    expect(data.envelopes.find((e) => e.type === 'cashIncome')?.expected).toBe(1200);
  });
});

describe('RiseUp sync', () => {
  const withdrawal = (id: string, date: string, amount = 500): RiseupTransaction => ({
    transactionId: id,
    transactionDate: `${date}T00:00:00.000Z`,
    cashflowDate: MONTH,
    businessName: 'משיכת מזומן',
    isIncome: false,
    amount,
    sourceType: 'checkingAccount',
  });

  it('links a withdrawal typed in by hand instead of counting the same cash twice', async () => {
    const { syncRiseup } = await import('@/lib/riseup/sync');
    await addCashEntry({ kind: 'withdrawal', amountIls: 500, category: '', note: 'לשבת', date: `${MONTH}-12`, envelopeId: null, memberId: null, walletId: null });

    riseup.transactions = [withdrawal('bank-1', `${MONTH}-14`), withdrawal('bank-2', `${MONTH}-20`, 200)];
    const result = await syncRiseup();
    expect(result.error).toBeNull();
    // Only the unmatched 200 is new; the 500 attached to the typed-in row.
    expect(result.newTopups.map((t) => Number(t.amount_ils))).toEqual([200]);
    expect(sql('select source, amount_ils, riseup_transaction_id, note from cash_topups order by amount_ils desc')).toEqual([
      { source: 'manual', amount_ils: 500, riseup_transaction_id: 'bank-1', note: 'לשבת' },
      { source: 'riseup_withdrawal', amount_ils: 200, riseup_transaction_id: 'bank-2', note: null },
    ]);

    // Running again adds nothing.
    expect((await syncRiseup()).newTopups).toHaveLength(0);
  });

  it('records the shape of the budget it saw, without a single amount', async () => {
    const { syncRiseup } = await import('@/lib/riseup/sync');
    riseup.budget = {
      envelopes: [
        { id: `${MONTH}#trackingCategory#v2-default-il-expense-category-13`, type: 'trackingCategory', balancedAmount: 0, originalAmount: -2850, actuals: [] },
        { id: `${MONTH}#variableIncome`, type: 'variableIncome', balancedAmount: 0, actuals: [] },
      ],
    };
    expect((await syncRiseup()).error).toBeNull();

    const [row] = sql<{ status: string; envelope_shape: { envelopes: Record<string, { count: number; fields: Record<string, string> }> } }>(
      'select status, envelope_shape from sync_runs',
    );
    expect(row?.status).toBe('succeeded');
    expect(row?.envelope_shape.envelopes.trackingCategory).toEqual({
      count: 1,
      fields: { actuals: 'array', balancedAmount: 'number:zero', id: 'string', originalAmount: 'number:nonzero', type: 'string' },
    });
    expect(JSON.stringify(row?.envelope_shape)).not.toContain('2850');
  });

  it('records why a sync failed, and the dashboard says so', async () => {
    const { syncRiseup } = await import('@/lib/riseup/sync');
    const { RiseupAuthError } = await import('@/lib/riseup/client');
    riseup.transactions = [];
    const client = await import('@/lib/riseup/client');
    vi.spyOn(client, 'fetchTransactions').mockRejectedValueOnce(new RiseupAuthError('401'));

    const result = await syncRiseup();
    expect(result.tokenExpired).toBe(true);
    expect(sql('select status, error_kind from sync_runs')).toEqual([{ status: 'failed', error_kind: 'auth' }]);
    expect((await loadDashboard(MONTH, member)).syncBanner?.tone).toBe('error');
  });
});

describe('sign-in codes', () => {
  it('signs in once with a fresh code, and the previous code stops working', async () => {
    const first = await issueLoginCode(member);
    const second = await issueLoginCode(member);
    expect(await redeemLoginCode(first)).toEqual({ ok: false, reason: 'wrong' });
    expect(await redeemLoginCode(second)).toEqual({ ok: true, memberId: member });
    expect(await redeemLoginCode(second)).toEqual({ ok: false, reason: 'wrong' });
  });

  it('refuses expired codes', async () => {
    const code = await issueLoginCode(member, Date.now() - 11 * 60 * 1000);
    expect(await redeemLoginCode(code)).toEqual({ ok: false, reason: 'wrong' });
  });

  it('locks every attempt after too many wrong guesses', async () => {
    const code = await issueLoginCode(member);
    for (let i = 0; i < MAX_FAILURES; i += 1) await redeemLoginCode('000000' === code ? '111111' : '000000');
    expect(await redeemLoginCode(code)).toEqual({ ok: false, reason: 'locked' });
  });
});
