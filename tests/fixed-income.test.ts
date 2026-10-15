import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EnvelopeCard } from '@/app/dashboard/components/EnvelopeCard';
import { menuItems } from '@/app/dashboard/components/EnvelopeMenu';
import { ForecastSheet } from '@/app/dashboard/components/ForecastSheet';
import { monthSnapshot } from '@/lib/assistant/context';
import { envelopeChoices } from '@/lib/cash/envelopes';
import { briefLabel } from '@/lib/dashboard/brief';
import { assembleMonth, monthTotals, type ActualRow, type DashboardData, type EnvelopeRow } from '@/lib/dashboard/data';
import { forecastBreakdown } from '@/lib/dashboard/forecast-breakdown';
import { incomeInsight } from '@/lib/dashboard/insights';
import { ENVELOPE_ORDER } from '@/lib/riseup/envelopes';
import { buildNameBook, type NameBook } from '@/lib/riseup/tracker-names';

/**
 * V2-19. After the salary was marked "fixed income" in RiseUp, RiseUp sends
 * it as one more `fixed` envelope (October 2026, live data):
 *
 *   2026-10#fixed#c6b3e219-c39f-11f1-b563-8dcdf033ade8  planned 7,635
 *     actual 7,635 "העברת משכורת", category "משכורת", isIncome = true
 *
 * and the variable income envelope is planned 0, actual 0. Such an envelope
 * is income: its own card "הכנסות קבועות", added in the forecast, never in
 * the expenses.
 */
const OCT = '2026-10';
const NOV = '2026-11';
const SALARY_KEY = 'c6b3e219-c39f-11f1-b563-8dcdf033ade8';
const fixed = (month: string, key: string) => `${month}#fixed#${key}`;

function rowsFor(month: string): EnvelopeRow[] {
  return [
    { envelope_id: fixed(month, 'loan-1'), envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 1842.36, position: 0 },
    { envelope_id: fixed(month, SALARY_KEY), envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 7635, position: 1 },
    { envelope_id: fixed(month, 'phone-1'), envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 114, position: 2 },
    { envelope_id: fixed(month, 'riseup-1'), envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 55, position: 3 },
    { envelope_id: `${month}#variableIncome`, envelope_type: 'variableIncome', name: 'הכנסות', planned_ils: 0, position: 4 },
    { envelope_id: `${month}#variable`, envelope_type: 'variable', name: 'הוצאות משתנות', planned_ils: 0, position: 5 },
  ];
}

function actual(envelopeId: string, id: string, amount: number, label: string, name: string, date: string, isIncome = false): ActualRow {
  return {
    envelope_id: envelopeId,
    transaction_id: id,
    transaction_date: date,
    billing_date: date,
    business_name: name,
    amount_ils: amount,
    is_income: isIncome,
    account_nickname: null,
    account_number_hash: isIncome ? 'c81bcf' : 'cc5910',
    source: isIncome ? 'leumiBank' : 'leumicard',
    is_installment: false,
    payment_number: null,
    total_payments: null,
    category_label: label,
  };
}

const octActuals: ActualRow[] = [
  actual(fixed(OCT, 'loan-1'), 'loan', 1821.85, 'הלוואה', 'בנק לאומי', '2026-10-02'),
  actual(fixed(OCT, SALARY_KEY), 'salary', 7635, 'משכורת', 'העברת משכורת', '2026-10-08', true),
  actual(fixed(OCT, 'phone-1'), 'phone', 114, 'תשלומים', 'פרטנר', '2026-10-03'),
  actual(`${OCT}#variable`, 'coffee', 124.32, 'אוכל בחוץ', 'ארומה', '2026-10-05'),
];

function month(m: string, actualRows: ActualRow[], names?: NameBook | null) {
  return assembleMonth({
    month: m,
    envelopeRows: rowsFor(m),
    actualRows,
    spends: [],
    topups: [],
    plans: [],
    skippedPlanIds: new Set(),
    memberNames: new Map(),
    names,
  });
}

describe('a fixed envelope whose charges are income (V2-19)', () => {
  const { envelopes, riseupEnvelopes } = month(OCT, octActuals);

  it('becomes its own income card, "הכנסות קבועות"', () => {
    const income = envelopes.filter((e) => e.type === 'fixedIncome');
    expect(income).toHaveLength(1);
    expect(income[0]).toMatchObject({ title: 'הכנסות קבועות', actual: 7635, expected: 7635 });
    expect(income[0]?.actuals.map((a) => a.transactionId)).toEqual(['salary']);
  });

  it('leaves the salary out of the fixed expenses card', () => {
    const fixedCard = envelopes.find((e) => e.type === 'fixed')!;
    expect(fixedCard.actuals.map((a) => a.transactionId).sort()).toEqual(['loan', 'phone']);
    expect(fixedCard.actual).toBe(1935.85);
    // 1842.36 + 114 + 55: the salary's 7,635 is not an expected expense.
    expect(fixedCard.expected).toBe(2011.36);
  });

  it('sits right after RiseUp’s income card', () => {
    expect(ENVELOPE_ORDER.indexOf('fixedIncome')).toBe(ENVELOPE_ORDER.indexOf('variableIncome') + 1);
    const types = envelopes.map((e) => e.type);
    expect(types.indexOf('fixedIncome')).toBe(types.indexOf('variableIncome') + 1);
  });

  it('is added in the forecast and never counted as spending', () => {
    const totals = monthTotals(envelopes);
    expect(totals.expectedExpenses).toBe(2011.36 + 124.32);
    expect(totals.actualExpenses).toBe(1935.85 + 124.32);
    expect(totals.forecast).toBe(Math.round((7635 - 2011.36 - 124.32) * 100) / 100);
  });

  it('shows in "איך חישבנו את הצפי?" as income, and the lines still add up', () => {
    const b = forecastBreakdown(envelopes);
    expect(b.fixedIncomeExpected).toBe(7635);
    expect(b.fixedExpected).toBe(2011.36);
    expect(b.forecast).toBe(monthTotals(envelopes).forecast);
    const html = renderToStaticMarkup(createElement(ForecastSheet, { open: true, onClose: () => {}, monthName: 'אוקטובר', breakdown: b }));
    expect(html).toContain('הכנסות קבועות');
  });

  it('is not offered in the pickers for a cash expense', () => {
    const choices = envelopeChoices(riseupEnvelopes.map((e) => ({ envelopeId: e.envelopeId, type: e.type, name: e.name, categoryLabels: e.actuals.map((a) => a.categoryLabel ?? '') })));
    expect(choices.some((c) => c.type === 'fixedIncome')).toBe(false);
    expect(choices.find((c) => c.type === 'fixed')?.categoryLabels).not.toContain('משכורת');
  });

  it('is labelled as income for the brief and the assistant', () => {
    expect(briefLabel('fixedIncome', 'הכנסות קבועות', 'משכורת', false)).toBe('הכנסות קבועות · משכורת');
    const snapshot = monthSnapshot({
      month: OCT,
      forecast: monthTotals(envelopes).forecast,
      totalActualExpenses: monthTotals(envelopes).actualExpenses,
      totalExpectedExpenses: monthTotals(envelopes).expectedExpenses,
      variableRemaining: 0,
      envelopes,
    } as unknown as DashboardData);
    expect(snapshot.expectedIncome).toBe(7635);
    expect(snapshot.transactions.find((t) => t.name === 'העברת משכורת')?.income).toBe(true);
    expect(snapshot.categories.some((c) => c.label === 'משכורת')).toBe(false);
  });

  it('counts for the "נכנסה הכנסה" insight', () => {
    const insight = incomeInsight({
      today: '2026-10-09',
      month: OCT,
      envelopes,
      trackers: [],
      forecast: 0,
      yesterdayForecast: null,
      wallet: { balance: 0, wallets: [] },
      baselineExpenses: [],
    });
    expect(insight?.key).toBe('income:salary');
  });

  it('reads like RiseUp’s income card: נכנס / צפוי להיכנס / פירוט הכנסות קבועות', () => {
    const card = envelopes.find((e) => e.type === 'fixedIncome')!;
    const html = renderToStaticMarkup(
      createElement(EnvelopeCard, {
        type: card.type,
        title: card.title,
        actual: card.actual,
        expected: card.expected,
        actuals: card.actuals,
        month: OCT,
        today: '2026-10-15',
        defaultOpen: true,
      }),
    );
    expect(html).toContain('נכנס');
    expect(html).toContain('צפוי להיכנס');
    expect(html).toContain('פירוט הכנסות קבועות');
    expect(html).toContain('משכורת');
    expect(html).not.toContain('יצא');
  });

  it('offers no cash-expense actions in its ⋮', () => {
    const card = envelopes.find((e) => e.type === 'fixedIncome')!;
    const actions = menuItems(card).map((i) => i.action);
    expect(actions).not.toContain('add-cash');
    expect(actions).not.toContain('bulk-move');
    expect(actions).toContain('history');
  });

  it('stays an expense when its charges are not all income', () => {
    const mixed = [...octActuals, actual(fixed(OCT, SALARY_KEY), 'fee', 10, 'עמלות', 'בנק לאומי', '2026-10-09')];
    const result = month(OCT, mixed);
    expect(result.envelopes.some((e) => e.type === 'fixedIncome')).toBe(false);
  });
});

describe('fixed income not paid yet this month (V2-19)', () => {
  // October's stored actuals teach the name book that this key is income.
  const names = buildNameBook({
    envelopes: [],
    actuals: octActuals.map((a) => ({
      envelope_id: a.envelope_id,
      category_label: a.category_label,
      business_name: a.business_name,
      transaction_date: a.transaction_date,
      is_income: a.is_income,
    })),
  });

  it('learns from earlier months which fixed keys are income', () => {
    expect(names.fixed.get(SALARY_KEY)?.income).toBe(true);
    expect(names.fixed.get('loan-1')?.income).toBe(false);
  });

  it('expects it as income, listed as still to come in', () => {
    const { envelopes } = month(NOV, [], names);
    const income = envelopes.find((e) => e.type === 'fixedIncome')!;
    expect(income).toMatchObject({ actual: 0, expected: 7635 });
    expect(income.upcoming).toEqual([{ key: fixed(NOV, SALARY_KEY), amountIls: 7635, categoryLabel: 'משכורת', businessName: 'העברת משכורת' }]);
    const fixedCard = envelopes.find((e) => e.type === 'fixed')!;
    expect(fixedCard.expected).toBe(2011.36);
    expect(monthTotals(envelopes).forecast).toBe(Math.round((7635 - 2011.36) * 100) / 100);
  });

  it('says "צפוי להיכנס" for the row still to come', () => {
    const { envelopes } = month(NOV, [], names);
    const income = envelopes.find((e) => e.type === 'fixedIncome')!;
    const html = renderToStaticMarkup(
      createElement(EnvelopeCard, {
        type: income.type,
        title: income.title,
        actual: income.actual,
        expected: income.expected,
        actuals: income.actuals,
        upcoming: income.upcoming,
        month: NOV,
        today: '2026-11-02',
        defaultOpen: true,
      }),
    );
    expect(html).toContain('צפוי להיכנס');
    expect(html).not.toContain('צפוי לרדת');
  });

  it('without that history, a charge not paid yet stays a fixed expense', () => {
    const { envelopes } = month(NOV, []);
    expect(envelopes.some((e) => e.type === 'fixedIncome')).toBe(false);
  });
});
