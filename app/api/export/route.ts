import { NextResponse } from 'next/server';

import { sessionMember } from '@/lib/auth/member';
import type { CashPlan } from '@/lib/cash/plans';
import { assembleMonth, currentMonth, toPlans, type ActualRow, type EnvelopeRow } from '@/lib/dashboard/data';
import { db } from '@/lib/db/client';
import { toCsv } from '@/lib/export/csv';
import { monthBounds } from '@/lib/reconcile';
import type { CashSpend, CashTopup, CashTransfer, CashWallet } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MONTH = /^\d{4}-\d{2}$/;
const MAX_MONTHS = 24;

function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  const [y, m] = from.split('-').map(Number);
  const cursor = new Date(Date.UTC(y!, m! - 1, 1));
  while (months.length < MAX_MONTHS) {
    const key = cursor.toISOString().slice(0, 7);
    if (key > to) break;
    months.push(key);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

/**
 * Everything in a month range as one spreadsheet: RiseUp's charges and our
 * cash, each in the envelope the dashboard files it under, plus withdrawals
 * and transfers between wallets. /api/export?from=2026-01&to=2026-09
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await sessionMember())) {
    return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const to = MONTH.test(params.get('to') ?? '') ? params.get('to')! : currentMonth();
  const from = MONTH.test(params.get('from') ?? '') ? params.get('from')! : to;
  if (from > to) return NextResponse.json({ ok: false, error: 'from is after to' }, { status: 400 });

  const months = monthRange(from, to);
  const start = monthBounds(months[0]!).from;
  const end = monthBounds(months[months.length - 1]!).to;
  const supabase = db();

  const [envelopes, actuals, spends, topups, transfers, plans, skips, members, wallets] = await Promise.all([
    supabase.from('riseup_envelopes').select('*').in('month', months),
    supabase.from('riseup_envelope_actuals').select('*').in('month', months),
    supabase.from('cash_spends').select('*').neq('status', 'deleted').gte('spent_at', start).lte('spent_at', end),
    supabase.from('cash_topups').select('*').eq('is_dismissed', false).gte('occurred_at', start).lte('occurred_at', end),
    supabase.from('cash_transfers').select('*').eq('is_dismissed', false).gte('occurred_at', start).lte('occurred_at', end),
    supabase.from('cash_plans').select('*').eq('is_active', true),
    supabase.from('cash_plan_skips').select('plan_id, month').in('month', months),
    supabase.from('household_members').select('id, display_name'),
    supabase.from('cash_wallets').select('*'),
  ]);
  const failed = [envelopes, actuals, spends, topups, transfers, plans, skips, members, wallets].find((r) => r.error);
  if (failed?.error) {
    console.error('Export failed:', failed.error.message);
    return NextResponse.json({ ok: false, error: 'export failed' }, { status: 500 });
  }

  const memberNames = new Map(((members.data ?? []) as { id: string; display_name: string }[]).map((m) => [m.id, m.display_name]));
  const walletList = (wallets.data ?? []) as CashWallet[];
  const walletNames = new Map(walletList.map((w) => [w.id, w.name]));
  const defaultWallet = walletList.find((w) => w.is_default)?.name ?? '';
  const walletName = (id: string | null) => (id ? (walletNames.get(id) ?? '') : defaultWallet);
  const planList = toPlans(plans.data as CashPlan[] | null);

  const rows: Array<Array<string | number | null>> = [
    ['תאריך', 'חודש תזרים', 'מעטפה', 'סוג', 'סכום', 'תיאור', 'קטגוריה', 'אמצעי', 'ארנק', 'מי', 'סטטוס'],
  ];

  for (const month of months) {
    const inMonth = <T,>(list: T[] | null, key: (row: T) => string) => (list ?? []).filter((row) => key(row).startsWith(month));
    const monthTopups = inMonth(topups.data as CashTopup[] | null, (t) => t.occurred_at);
    const { envelopes: views } = assembleMonth({
      month,
      envelopeRows: inMonth(envelopes.data as (EnvelopeRow & { month: string })[] | null, (r) => r.month),
      actualRows: inMonth(actuals.data as (ActualRow & { month: string })[] | null, (r) => r.month),
      spends: inMonth(spends.data as CashSpend[] | null, (s) => s.spent_at),
      topups: monthTopups,
      plans: planList,
      skippedPlanIds: new Set(((skips.data ?? []) as { plan_id: string; month: string }[]).filter((s) => s.month === month).map((s) => s.plan_id)),
      memberNames,
    });

    for (const view of views) {
      for (const actual of view.actuals) {
        const cash = actual.cash;
        rows.push([
          actual.transactionDate,
          month,
          view.title,
          actual.isIncome ? 'הכנסה' : 'הוצאה',
          actual.amountIls,
          actual.businessName,
          actual.categoryLabel,
          cash ? 'מזומן' : actual.accountNickname || (actual.accountNumberHash ? `כרטיס ${actual.accountNumberHash}` : 'RiseUp'),
          cash ? walletName(cash.walletId) : '',
          cash?.memberName ?? '',
          cash?.status === 'needs_review' ? 'ממתין לאישור' : '',
        ]);
      }
    }

    // Cash moving between the bank and wallets: not income or spending, but
    // it is how the wallet balance adds up, so it belongs in the file.
    for (const t of monthTopups.filter((x) => x.source !== 'cash_income')) {
      rows.push([
        t.occurred_at,
        month,
        '',
        'משיכה',
        Number(t.amount_ils),
        t.note || t.business_name || 'משיכת מזומן',
        '',
        t.source === 'riseup_withdrawal' ? 'בנק' : 'מזומן',
        walletName(t.wallet_id),
        t.member_id ? (memberNames.get(t.member_id) ?? '') : '',
        '',
      ]);
    }
    for (const x of inMonth(transfers.data as CashTransfer[] | null, (r) => r.occurred_at)) {
      rows.push([
        x.occurred_at,
        month,
        '',
        'העברה בין ארנקים',
        Number(x.amount_ils),
        `${walletName(x.from_wallet_id)} ← ${walletName(x.to_wallet_id)}`,
        '',
        'מזומן',
        walletName(x.to_wallet_id),
        x.member_id ? (memberNames.get(x.member_id) ?? '') : '',
        '',
      ]);
    }
  }

  const header = rows[0]!;
  const body = rows.slice(1).sort((a, b) => String(a[0] ?? '').localeCompare(String(b[0] ?? '')));
  const filename = from === to ? `our-money-${from}.csv` : `our-money-${from}-to-${to}.csv`;

  return new Response(toCsv([header, ...body]), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
