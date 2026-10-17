import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EnvelopeList } from '@/app/dashboard/components/EnvelopeList';
import { menuItems } from '@/app/dashboard/components/EnvelopeMenu';
import { ForecastSheet } from '@/app/dashboard/components/ForecastSheet';
import { IncomeCard } from '@/app/dashboard/components/IncomeCard';
import { assembleMonth, monthTotals, type ActualRow, type EnvelopeRow, type EnvelopeView } from '@/lib/dashboard/data';
import { forecastBreakdown } from '@/lib/dashboard/forecast-breakdown';
import { incomeCard } from '@/lib/dashboard/income-card';
import type { CashTopup } from '@/lib/types';

/**
 * C34: RiseUp shows one "הכנסות" card. The salary — which RiseUp now sends
 * as fixed income — sits inside it, beside the variable income, instead of
 * on a card of its own.
 */
const OCT = '2026-10';
const SALARY = `${OCT}#fixed#c6b3e219-c39f-11f1-b563-8dcdf033ade8`;

function rows(variablePlanned = 0): EnvelopeRow[] {
  return [
    { envelope_id: `${OCT}#fixed#loan`, envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 1842.36, position: 0 },
    { envelope_id: SALARY, envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 7635, position: 1 },
    { envelope_id: `${OCT}#variableIncome`, envelope_type: 'variableIncome', name: 'הכנסות', planned_ils: variablePlanned, position: 4 },
    { envelope_id: `${OCT}#variable`, envelope_type: 'variable', name: 'הוצאות משתנות', planned_ils: 0, position: 5 },
  ];
}

function actual(envelopeId: string, id: string, amount: number, label: string, name: string, isIncome = false): ActualRow {
  return {
    envelope_id: envelopeId, transaction_id: id, transaction_date: '2026-10-08', billing_date: '2026-10-08',
    business_name: name, amount_ils: amount, is_income: isIncome, account_nickname: null, account_number_hash: null,
    source: null, is_installment: false, payment_number: null, total_payments: null, category_label: label,
  };
}

const salary = actual(SALARY, 'salary', 7635, 'משכורת', 'העברת משכורת', true);
const loan = actual(`${OCT}#fixed#loan`, 'loan', 1821.85, 'הלוואה', 'בנק לאומי');
const refund = actual(`${OCT}#variableIncome`, 'refund', 450, 'החזר מס', 'מס הכנסה', true);

const tutoring: CashTopup = {
  id: 't1', amount_ils: 300, occurred_at: '2026-10-09', source: 'cash_income', riseup_transaction_id: null,
  business_name: null, note: 'שיעור פרטי', is_dismissed: false, member_id: null, category: 'שיעורים',
  input_kind: 'web', wallet_id: null, plan_id: null,
};

function month(actualRows: ActualRow[], extra: { variablePlanned?: number; topups?: CashTopup[] } = {}) {
  return assembleMonth({
    month: OCT, envelopeRows: rows(extra.variablePlanned), actualRows, spends: [], topups: extra.topups ?? [],
    plans: [], skippedPlanIds: new Set(), memberNames: new Map(),
  }).envelopes;
}

function card(envelopes: EnvelopeView[]) {
  const found = incomeCard(envelopes)!;
  return renderToStaticMarkup(
    createElement(IncomeCard, { variable: found.variable, fixed: found.fixed, month: OCT, today: '2026-10-15', defaultOpen: true }),
  );
}

describe('one income card (C34)', () => {
  it('hosts both kinds of income where RiseUp\'s income card is, and drops the separate fixed card', () => {
    const envelopes = month([salary, loan]);
    const found = incomeCard(envelopes)!;
    expect(found.hostKey).toBe(envelopes.find((e) => e.type === 'variableIncome')!.key);
    expect(found.hidden).toBe(envelopes.find((e) => e.type === 'fixedIncome')!.key);
    expect(found.actual).toBe(7635);
    expect(found.expected).toBe(7635);
  });

  it('is titled "הכנסות", with נכנס / צפוי להיכנס of both, and the salary under "הכנסות קבועות"', () => {
    const html = card(month([salary, loan]));
    expect(html).toContain('<h2 class="card-title">הכנסות</h2>');
    expect(html).toContain('נכנס');
    expect(html).toContain('צפוי להיכנס');
    expect(html).toContain('7,635');
    expect(html).toContain('הכנסות קבועות');
    expect(html).toContain('משכורת');
    // No variable income this month: no empty section for it.
    expect(html).not.toContain('הכנסות משתנות');
    expect(html).not.toContain('יצא');
  });

  it('adds a "הכנסות משתנות" section once there is variable income, and sums both', () => {
    const envelopes = month([salary, loan, refund], { variablePlanned: 450 });
    const found = incomeCard(envelopes)!;
    expect(found.actual).toBe(7635 + 450);
    expect(found.expected).toBe(7635 + 450);
    const html = card(envelopes);
    expect(html).toContain('8,085');
    expect(html).toContain('הכנסות קבועות');
    expect(html).toContain('הכנסות משתנות');
    expect(html).toContain('החזר מס');
    expect(html.indexOf('הכנסות קבועות')).toBeLessThan(html.indexOf('הכנסות משתנות'));
  });

  it('shows a salary not paid yet as "צפוי להיכנס"', () => {
    // No salary this month yet: RiseUp still plans it, and the card expects it.
    const names = {
      fixed: new Map([['c6b3e219-c39f-11f1-b563-8dcdf033ade8', { label: 'משכורת', businessName: 'העברת משכורת', income: true }]]),
    };
    const envelopes = assembleMonth({
      month: OCT, envelopeRows: rows(), actualRows: [loan], spends: [], topups: [], plans: [], skippedPlanIds: new Set(),
      memberNames: new Map(), names: names as never,
    }).envelopes;
    const found = incomeCard(envelopes)!;
    expect(found.actual).toBe(0);
    expect(found.expected).toBe(7635);
    const html = card(envelopes);
    expect(html).toContain('הכנסות קבועות');
    expect(html).toContain('is-upcoming');
    expect(html).toContain('העברת משכורת');
  });

  it('with no fixed income, is RiseUp\'s income card alone', () => {
    const envelopes = month([loan, refund], { variablePlanned: 450 });
    expect(envelopes.some((e) => e.type === 'fixedIncome')).toBe(false);
    const found = incomeCard(envelopes)!;
    expect(found.hidden).toBeNull();
    const html = card(envelopes);
    expect(html).toContain('הכנסות משתנות');
    expect(html).not.toContain('הכנסות קבועות');
  });

  it('keeps the income ⋮ actions, on the variable part', () => {
    const found = incomeCard(month([salary, loan]))!;
    expect(found.variable?.type).toBe('variableIncome');
    expect(menuItems(found.variable!).map((i) => i.label)).toEqual([
      'חודשים קודמים', 'עדכון הכנסה צפויה', 'העברת כמה הכנסות יחד', 'הוספת הכנסה',
    ]);
  });

  it('on the dashboard: one "הכנסות" card, no "הכנסות קבועות" card, and the cash income card as it was', () => {
    const envelopes = month([salary, loan], { topups: [tutoring] });
    const html = renderToStaticMarkup(
      createElement(EnvelopeList, {
        envelopes, envelopeChoices: [], savingsEnvelopeId: null,
        wallet: { balance: 0, wallets: [], withdrawn: 0, income: 0, spent: 0, movements: [] },
        members: [], months: [OCT], sessionMemberId: null, month: OCT, today: '2026-10-15',
        totalActualExpenses: 0, totalExpectedExpenses: 0,
      }),
    );
    expect(html.match(/<h2 class="card-title">הכנסות<\/h2>/g)).toHaveLength(1);
    expect(html).not.toContain('<h2 class="card-title">הכנסות קבועות</h2>');
    expect(html).toContain('<h2 class="card-title">הכנסות במזומן</h2>');
  });

  it('leaves the forecast as it was — nothing counted twice — and the forecast sheet reads like the card', () => {
    const envelopes = month([salary, loan, refund], { variablePlanned: 450 });
    const totals = monthTotals(envelopes);
    const b = forecastBreakdown(envelopes);
    expect(b.forecast).toBe(totals.forecast);
    expect(totals.forecast).toBe(Math.round((7635 + 450 - 1842.36) * 100) / 100);
    const html = renderToStaticMarkup(createElement(ForecastSheet, { open: true, onClose: () => {}, monthName: 'אוקטובר', breakdown: b }));
    // One income line, as on the dashboard: both kinds, with the split under it.
    expect(html).toContain('הכנסות צפויות');
    expect(html).toContain('8,085');
    expect(html).toContain('הכנסות קבועות');
    expect(html).toContain('הכנסות משתנות');
  });
});
