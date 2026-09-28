import { describe, expect, it } from 'vitest';

import {
  expectedWithCash,
  occurrenceDate,
  occursIn,
  planEnvelope,
  planOccurrences,
  type CashPlan,
} from '@/lib/cash/plans';
import type { EnvelopeRef } from '@/lib/cash/envelopes';

function plan(overrides: Partial<CashPlan> = {}): CashPlan {
  return {
    id: 'p-cleaner',
    kind: 'spend',
    amount_ils: 800,
    category: 'ניקיון',
    note: 'עוזרת בית',
    envelope_type: 'fixed',
    envelope_name: null,
    day_of_month: 10,
    recurrence: 'monthly',
    starts_month: '2026-06',
    ends_month: null,
    wallet_id: null,
    member_id: null,
    is_active: true,
    ...overrides,
  };
}

describe('occursIn', () => {
  it('runs monthly from its start month, open-ended', () => {
    expect(occursIn(plan(), '2026-05')).toBe(false);
    expect(occursIn(plan(), '2026-06')).toBe(true);
    expect(occursIn(plan(), '2027-01')).toBe(true);
  });

  it('stops after its end month and when switched off', () => {
    expect(occursIn(plan({ ends_month: '2026-09' }), '2026-09')).toBe(true);
    expect(occursIn(plan({ ends_month: '2026-09' }), '2026-10')).toBe(false);
    expect(occursIn(plan({ is_active: false }), '2026-09')).toBe(false);
  });

  it('happens exactly once for a one-off plan', () => {
    const once = plan({ recurrence: 'once', starts_month: '2026-09' });
    expect(occursIn(once, '2026-09')).toBe(true);
    expect(occursIn(once, '2026-10')).toBe(false);
  });
});

describe('occurrenceDate', () => {
  it('clamps to the end of a short month', () => {
    expect(occurrenceDate(31, '2026-02')).toBe('2026-02-28');
    expect(occurrenceDate(31, '2028-02')).toBe('2028-02-29');
    expect(occurrenceDate(5, '2026-09')).toBe('2026-09-05');
  });
});

describe('planOccurrences', () => {
  it('is pending until an entry settles it, then carries what was actually paid', () => {
    const [pending] = planOccurrences([plan()], '2026-09', [], new Set());
    expect(pending).toMatchObject({ status: 'pending', amountIls: 800, date: '2026-09-10' });

    const [settled] = planOccurrences(
      [plan()],
      '2026-09',
      [{ planId: 'p-cleaner', entryId: 's1', amountIls: 850, date: '2026-09-11' }],
      new Set(),
    );
    expect(settled).toMatchObject({ status: 'settled', amountIls: 850, plannedIls: 800, settledEntryIds: ['s1'] });
  });

  it('ignores a settlement from another month', () => {
    const [occurrence] = planOccurrences(
      [plan()],
      '2026-09',
      [{ planId: 'p-cleaner', entryId: 's-aug', amountIls: 800, date: '2026-08-10' }],
      new Set(),
    );
    expect(occurrence?.status).toBe('pending');
  });

  it('drops a skipped month', () => {
    expect(planOccurrences([plan()], '2026-09', [], new Set(['p-cleaner']))).toEqual([]);
  });
});

describe('planEnvelope', () => {
  const refs: EnvelopeRef[] = [
    { envelopeId: 'var', type: 'variable', name: 'הוצאות משתנות' },
    { envelopeId: 'fix', type: 'fixed', name: 'הוצאות קבועות' },
    { envelopeId: 'kids', type: 'trackingCategory', name: 'ילדים' },
  ];

  it('finds a tracker by name, even though its id changes every month', () => {
    expect(planEnvelope({ envelope_type: 'trackingCategory', envelope_name: 'ילדים', category: 'x' }, refs)?.envelopeId).toBe('kids');
  });

  it('falls back to the type, then to the category rules', () => {
    expect(planEnvelope({ envelope_type: 'fixed', envelope_name: null, category: 'x' }, refs)?.envelopeId).toBe('fix');
    expect(planEnvelope({ envelope_type: 'trackingCategory', envelope_name: 'נעלם', category: 'ילדים' }, refs)?.envelopeId).toBe('kids');
    expect(planEnvelope({ envelope_type: null, envelope_name: null, category: 'משהו' }, refs)?.envelopeId).toBe('var');
  });
});

describe('expectedWithCash', () => {
  const base = { riseupPlanned: 5000, riseupActual: 3000, cashActual: 0, planCommitted: 0, pending: 0 };

  it("leaves RiseUp's plan alone when no cash is involved", () => {
    expect(expectedWithCash({ ...base, type: 'variable' })).toBe(5000);
    expect(expectedWithCash({ ...base, type: 'fixed', riseupActual: 6000 })).toBe(5000);
  });

  it('absorbs cash inside a variable budget until it is overspent', () => {
    expect(expectedWithCash({ ...base, type: 'variable', cashActual: 400 })).toBe(5000);
    expect(expectedWithCash({ ...base, type: 'variable', cashActual: 2500 })).toBe(5500);
  });

  it('counts an overspent budget plus the cash still due', () => {
    // Card already 5500 of a 5000 budget, and 300 of cash still to pay.
    const figures = { ...base, type: 'variable' as const, riseupActual: 5500, planCommitted: 300, pending: 300 };
    expect(expectedWithCash(figures)).toBe(5800);
    // Paid: the 300 moves from pending into cash actual; the total holds.
    expect(expectedWithCash({ ...figures, pending: 0, cashActual: 300 })).toBe(5800);
  });

  it('adds every cash payment on top of the itemised fixed envelope', () => {
    expect(expectedWithCash({ ...base, type: 'fixed', cashActual: 200 })).toBe(5200);
    expect(expectedWithCash({ ...base, type: 'fixed', planCommitted: 800, pending: 800 })).toBe(5800);
    // Once paid, the same 800 is cash actual instead of pending.
    expect(expectedWithCash({ ...base, type: 'fixed', planCommitted: 800, cashActual: 800 })).toBe(5800);
  });

  it('expects cash income that has arrived plus what is still due', () => {
    expect(
      expectedWithCash({ type: 'cashIncome', riseupPlanned: 0, riseupActual: 0, cashActual: 350, planCommitted: 2000, pending: 2000 }),
    ).toBe(2350);
  });
});
