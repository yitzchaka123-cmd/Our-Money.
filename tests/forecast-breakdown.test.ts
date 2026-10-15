import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ForecastSheet } from '@/app/dashboard/components/ForecastSheet';
import type { CashPlan } from '@/lib/cash/plans';
import { assembleMonth, monthTotals, type ActualRow, type EnvelopeRow } from '@/lib/dashboard/data';
import { forecastBreakdown } from '@/lib/dashboard/forecast-breakdown';
import type { CashSpend, CashTopup } from '@/lib/types';

const envelopeRows: EnvelopeRow[] = [
  { envelope_id: 'inc', envelope_type: 'variableIncome', name: null, planned_ils: 12000, position: 0 },
  { envelope_id: 'var', envelope_type: 'variable', name: null, planned_ils: 5000, position: 1 },
  { envelope_id: 'kids', envelope_type: 'trackingCategory', name: 'ילדים', planned_ils: 800, position: 2 },
  { envelope_id: 'fix', envelope_type: 'fixed', name: null, planned_ils: 4000, position: 3 },
  { envelope_id: 'goal', envelope_type: 'riseupGoal', name: 'חיסכון', planned_ils: 1000, position: 4 },
];

function actual(envelope: string, id: string, amount: number, isIncome = false): ActualRow {
  return {
    envelope_id: envelope,
    transaction_id: id,
    transaction_date: '2026-09-05',
    billing_date: '2026-09-05',
    business_name: 'חנות',
    amount_ils: amount,
    is_income: isIncome,
    account_nickname: null,
    account_number_hash: null,
    source: null,
    is_installment: false,
    payment_number: null,
    total_payments: null,
    category_label: null,
  };
}

const spend: CashSpend = {
  id: 's1',
  member_id: 'm1',
  amount_ils: 150,
  category: 'סופר',
  note: null,
  spent_at: '2026-09-10',
  status: 'confirmed',
  confidence: 'high',
  input_kind: 'web',
  raw_input: null,
  transcript: null,
  telegram_update_id: null,
  telegram_chat_id: null,
  telegram_message_id: null,
  bot_message_id: null,
  envelope_id: 'var',
  envelope_type: 'variable',
  wallet_id: null,
  plan_id: null,
  created_at: '2026-09-10T10:00:00Z',
};

const topup: CashTopup = {
  id: 't1',
  amount_ils: 400,
  occurred_at: '2026-09-12',
  source: 'cash_income',
  riseup_transaction_id: null,
  business_name: null,
  note: 'שיעורים',
  is_dismissed: false,
  member_id: 'm1',
  category: 'שיעורים',
  input_kind: 'web',
  wallet_id: null,
  plan_id: null,
};

const cleaner: CashPlan = {
  id: 'p1',
  kind: 'spend',
  amount_ils: 800,
  category: 'ניקיון',
  note: 'עוזרת בית',
  envelope_type: 'fixed',
  envelope_name: null,
  day_of_month: 20,
  recurrence: 'monthly',
  starts_month: '2026-01',
  ends_month: null,
  wallet_id: null,
  member_id: null,
  is_active: true,
};

const { envelopes } = assembleMonth({
  month: '2026-09',
  envelopeRows,
  actualRows: [actual('inc', 'i1', 12000, true), actual('var', 'v1', 3000), actual('kids', 'k1', 950), actual('fix', 'f1', 3500)],
  spends: [spend],
  topups: [topup],
  plans: [cleaner],
  skippedPlanIds: new Set(),
  memberNames: new Map([['m1', 'יצחק']]),
});

describe('forecastBreakdown', () => {
  const b = forecastBreakdown(envelopes);

  it('takes every figure from the envelopes the forecast is built from', () => {
    expect(b).toMatchObject({
      incomeExpected: 12000,
      fixedIncomeExpected: 0,
      cashIn: 400,
      fixedExpected: 4800,
      fixedUpcoming: [],
      trackersExpected: 950,
      weeklyTrackers: [],
      variableExpected: 5000,
      variableSpent: 3150,
      savingsExpected: 1000,
      cashOut: 950,
      forecast: monthTotals(envelopes).forecast,
    });
  });

  it('adds up to the forecast on the card', () => {
    expect(b.incomeExpected + b.cashIn - b.fixedExpected - b.trackersExpected - b.variableExpected - b.savingsExpected).toBe(b.forecast);
    expect(b.forecast).toBe(12400 - 4800 - 950 - 5000 - 1000);
  });
});

describe('ForecastSheet', () => {
  const html = renderToStaticMarkup(
    createElement(ForecastSheet, { open: true, onClose: () => {}, monthName: 'ספטמבר', breakdown: forecastBreakdown(envelopes) }),
  );

  it('explains the forecast line by line', () => {
    expect(html).toContain('איך חישבנו את הצפי?');
    for (const label of ['הכנסות צפויות', 'הכנסות במזומן', 'הוצאות קבועות צפויות', 'הוצאות במעקב צפויות', 'הוצאות משתנות', 'הוצאתם עד עכשיו', 'חיסכון', 'מזומן שיצא', 'הצפי לסוף ספטמבר']) {
      expect(html).toContain(label);
    }
  });

  it('renders nothing while closed', () => {
    expect(
      renderToStaticMarkup(createElement(ForecastSheet, { open: false, onClose: () => {}, monthName: 'ספטמבר', breakdown: forecastBreakdown(envelopes) })),
    ).toBe('');
  });
});
