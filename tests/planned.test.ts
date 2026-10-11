import { describe, expect, it } from 'vitest';

import { assembleMonth, monthTotals, type ActualRow, type EnvelopeRow } from '@/lib/dashboard/data';
import { normalizeEnvelope, plannedAmount } from '@/lib/riseup/envelopes';
import { envelopeShape } from '@/lib/riseup/shape';
import type { RiseupBudget, RiseupEnvelope } from '@/lib/types';

function envelope(fields: Partial<RiseupEnvelope> & Record<string, unknown>): RiseupEnvelope {
  return { id: '2026-10#trackingCategory#v2-default-il-expense-category-13', type: 'trackingCategory', ...fields } as RiseupEnvelope;
}

describe('plannedAmount', () => {
  it('reads the documented balancedAmount as a magnitude', () => {
    expect(plannedAmount(envelope({ balancedAmount: -450 }))).toBe(450);
  });

  it('skips a zero balancedAmount for a non-zero originalAmount', () => {
    expect(plannedAmount(envelope({ balancedAmount: 0, originalAmount: -2850 }))).toBe(2850);
  });

  it.each(['amount', 'plannedAmount', 'goal', 'budget', 'expectedAmount', 'predictedAmount', 'customPrediction'])(
    'falls back to the undocumented %s field when the documented ones are zero',
    (field) => {
      expect(plannedAmount(envelope({ balancedAmount: 0, originalAmount: 0, [field]: -200 }))).toBe(200);
    },
  );

  it('accepts a numeric string', () => {
    expect(plannedAmount(envelope({ balancedAmount: 0, goal: '450' }))).toBe(450);
  });

  it('ignores non-numeric values and stays at zero when nothing is planned', () => {
    expect(plannedAmount(envelope({ balancedAmount: 0, goal: 'abc', budget: true }))).toBe(0);
    expect(plannedAmount(envelope({}))).toBe(0);
  });
});

describe('variable income', () => {
  const incomeActual = { transactionId: 't1', isIncome: true, incomeAmount: 7635, billingAmount: null };

  it('expects what already came in when RiseUp sends no plan', () => {
    const normalized = normalizeEnvelope(
      { id: '2026-10#variableIncome', type: 'variableIncome', balancedAmount: 0, actuals: [incomeActual] },
      0,
    );
    expect(normalized.plannedIls).toBe(7635);
  });

  it('keeps a plan that is larger than what came in so far', () => {
    const normalized = normalizeEnvelope(
      { id: '2026-10#variableIncome', type: 'variableIncome', balancedAmount: 9000, actuals: [incomeActual] },
      0,
    );
    expect(normalized.plannedIls).toBe(9000);
  });

  it('does the same for rows already stored with a zero plan', () => {
    const envelopeRows: EnvelopeRow[] = [
      { envelope_id: 'inc', envelope_type: 'variableIncome', name: 'הכנסות', planned_ils: 0, position: 0 },
      { envelope_id: 'var', envelope_type: 'variable', name: null, planned_ils: 1000, position: 1 },
    ];
    const actualRows: ActualRow[] = [
      {
        envelope_id: 'inc',
        transaction_id: 'i1',
        transaction_date: '2026-10-04',
        billing_date: '2026-10-04',
        business_name: 'משכורת',
        amount_ils: 7635,
        is_income: true,
        account_nickname: null,
        account_number_hash: null,
        source: null,
        is_installment: false,
        payment_number: null,
        total_payments: null,
        category_label: null,
      },
    ];
    const { envelopes } = assembleMonth({
      month: '2026-10',
      envelopeRows,
      actualRows,
      spends: [],
      topups: [],
      plans: [],
      skippedPlanIds: new Set(),
      memberNames: new Map(),
    });
    expect(envelopes.find((e) => e.type === 'variableIncome')?.expected).toBe(7635);
    expect(monthTotals(envelopes).forecast).toBe(7635 - 1000);
  });
});

describe('envelopeShape', () => {
  const budget: RiseupBudget & Record<string, unknown> = {
    budgetDate: '2026-10',
    lastUpdatedAt: '2026-10-11T07:00:00Z',
    envelopes: [
      {
        id: '2026-10#trackingCategory#v2-default-il-expense-category-13',
        type: 'trackingCategory',
        balancedAmount: 0,
        originalAmount: -2850,
        isCustomPrediction: false,
        sequenceCustomerComment: 'סוד של המשפחה',
        actuals: [
          { transactionId: 'secret-txn', billingAmount: 4.27, incomeAmount: null, businessName: 'פז' },
        ],
      },
      {
        id: '2026-10#trackingCategory#v2-default-il-expense-category-33',
        type: 'trackingCategory',
        balancedAmount: 0,
        originalAmount: 0,
        actuals: [],
      },
      {
        id: '2026-10#variableIncome',
        type: 'variableIncome',
        balancedAmount: 0,
        originalAmount: 0,
        actuals: [],
      },
    ],
  };

  const shape = envelopeShape([budget]);
  const text = JSON.stringify(shape);

  it('records field names and value kinds per envelope type', () => {
    expect(shape.envelopes.trackingCategory).toMatchObject({
      count: 2,
      fields: {
        id: 'string',
        balancedAmount: 'number:zero',
        originalAmount: 'number:mixed',
        isCustomPrediction: 'boolean',
        sequenceCustomerComment: 'string',
        actuals: 'array',
      },
    });
    expect(shape.envelopes.variableIncome?.fields.originalAmount).toBe('number:zero');
  });

  it('records the field names of the actuals and of the budget itself', () => {
    expect(shape.actuals).toMatchObject({ billingAmount: 'number:nonzero', incomeAmount: 'null', businessName: 'string' });
    expect(Object.keys(shape.budget)).toEqual(expect.arrayContaining(['budgetDate', 'lastUpdatedAt', 'envelopes']));
  });

  it('never carries an amount, an id or any text', () => {
    for (const leak of ['2850', '4.27', 'סוד', 'פז', 'secret-txn', 'category-13', '2026-10']) {
      expect(text).not.toContain(leak);
    }
  });
});
