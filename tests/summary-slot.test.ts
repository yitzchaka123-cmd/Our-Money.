import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EnvelopeList } from '@/app/dashboard/components/EnvelopeList';
import type { EnvelopeView } from '@/lib/dashboard/data';
import { summarySlot } from '@/lib/dashboard/summary-slot';
import type { EnvelopeType } from '@/lib/types';

function envelope(key: string, type: EnvelopeType, title = key): EnvelopeView {
  return {
    key,
    envelopeId: key,
    type,
    title,
    actual: 100,
    expected: 500,
    actuals: [],
    showRemaining: type === 'variable',
    pending: [],
    pendingTotal: 0,
  };
}

const income = envelope('inc', 'variableIncome', 'הכנסות');
const variable = envelope('var', 'variable', 'הוצאות משתנות');
const kids = envelope('kids', 'trackingCategory', 'ילדים');
const fixed = envelope('fix', 'fixed', 'הוצאות קבועות');

describe('where the spending summary sits (V1-check-9)', () => {
  it('after the fixed envelope, as in RiseUp', () => {
    expect(summarySlot([variable, kids, fixed, income])).toBe('fix');
  });

  it('after the last tracker (and its add button) when a month has no fixed envelope', () => {
    expect(summarySlot([variable, kids, income])).toBe('kids');
  });

  it('after the variable envelope when there are no trackers either', () => {
    expect(summarySlot([variable, income])).toBe('var');
  });

  it('nowhere when there are no expense envelopes at all', () => {
    expect(summarySlot([income])).toBeNull();
  });

  it('still shows, after "הוספת קטגוריה למעקב", in a month with no fixed envelope', () => {
    const html = renderToStaticMarkup(
      createElement(EnvelopeList, {
        envelopes: [variable, kids, income],
        envelopeChoices: [],
        savingsEnvelopeId: null,
        wallet: { balance: 0, wallets: [], withdrawn: 0, income: 0, spent: 0, movements: [] },
        members: [],
        months: ['2026-10'],
        sessionMemberId: 'm1',
        month: '2026-10',
        today: '2026-10-13',
        totalActualExpenses: 200,
        totalExpectedExpenses: 1000,
      }),
    );
    const summary = html.indexOf('סך כל ההוצאות עד עכשיו');
    expect(summary).toBeGreaterThan(-1);
    expect(summary).toBeGreaterThan(html.indexOf('הוספת קטגוריה למעקב'));
    expect(summary).toBeLessThan(html.indexOf('הכנסות'));
  });
});
