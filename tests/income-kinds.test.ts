import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CashEntrySheet, emptyDraft } from '@/app/dashboard/components/CashEntrySheet';
import { IncomeKindFields, IncomeKindSheet } from '@/app/dashboard/components/IncomeKind';
import { TransactionSheet } from '@/app/dashboard/components/TransactionSheet';
import { countsInCashflow, incomeCategoryChoices, incomeKindOf } from '@/lib/cash/income-kinds';
import { actualDraft } from '@/lib/dashboard/entry-drafts';
import type { NormalizedActual } from '@/lib/riseup/envelopes';
import type { CashTopup } from '@/lib/types';

function income(category: string | null, date: string, o: Partial<CashTopup> = {}): CashTopup {
  return {
    id: crypto.randomUUID(), amount_ils: 100, occurred_at: date, source: 'cash_income', riseup_transaction_id: null, business_name: null,
    note: null, is_dismissed: false, member_id: null, category, input_kind: 'web', wallet_id: null, ...o,
  };
}

const cashIncome: NormalizedActual = {
  transactionId: 'cash-income:i1', transactionDate: '2026-10-08', billingDate: '2026-10-08', businessName: 'שיעורים פרטיים', amountIls: 600,
  isIncome: true, accountNickname: 'מזומן', accountNumberHash: null, source: 'cash', isInstallment: false, paymentNumber: null,
  totalPayments: null, categoryLabel: 'שיעורים פרטיים',
  cash: { id: 'i1', kind: 'income', memberId: 'm2', memberName: 'שרה', inputKind: 'web', status: 'confirmed', walletId: 'w-main', incomeKind: 'fixed' },
};

describe('income kinds (V4-08)', () => {
  it('reads a stored row: its kind, else fixed when it settles a plan, else variable', () => {
    expect(incomeKindOf({ income_kind: 'non_cashflow', plan_id: null })).toBe('non_cashflow');
    expect(incomeKindOf({ income_kind: null, plan_id: 'p1' })).toBe('fixed');
    expect(incomeKindOf({ income_kind: null, plan_id: null })).toBe('variable');
  });

  it('keeps "not cashflow" income out of the cashflow', () => {
    expect(countsInCashflow({ income_kind: 'non_cashflow' })).toBe(false);
    expect(countsInCashflow({ income_kind: 'fixed' })).toBe(true);
    expect(countsInCashflow({ income_kind: null })).toBe(true);
  });

  it("offers RiseUp's categories, then the couple's own, most recent first, once each", () => {
    const choices = incomeCategoryChoices([
      income('מתנה', '2026-08-01'),
      income('שיעורים פרטיים', '2026-10-01'),
      income('משכורת', '2026-09-01'),
      income('מתנה', '2026-09-15'),
      income('אחר', '2026-09-20'),
      income('ישן', '2026-07-01', { is_dismissed: true }),
      { ...income('משיכה', '2026-10-02'), source: 'manual' },
    ]);
    expect(choices).toEqual(['משכורת', 'דיור', 'קצבאות', 'שיעורים פרטיים', 'מתנה']);
  });
});

describe('"איזו הכנסה זו?" on screen (V4-08)', () => {
  const fields = (kind: 'variable' | 'fixed' | 'non_cashflow', category: string, choices?: string[]) =>
    renderToStaticMarkup(createElement(IncomeKindFields, { kind, category, choices, onChange: () => {} }));

  it('lists the three kinds, the chosen one checked, with what it means', () => {
    const html = fields('fixed', 'משכורת');
    for (const label of ['משתנה', 'קבועה', 'לא תזרימית']) expect(html).toContain(`<span class="picker-label">${label}</span>`);
    expect(html).toMatch(/aria-checked="true"[^>]*data-selected="true"[\s\S]*?קבועה/);
    expect(html).toContain('נצפה להכנסה דומה גם בחודשים הבאים');
    expect(html).toContain('איזו הכנסה קבועה זו?');
  });

  it('offers the categories plus "אחר", the chosen one picked', () => {
    const html = fields('variable', 'דיור', ['משכורת', 'דיור', 'קצבאות', 'מתנה']);
    expect(html).toMatch(/data-selected="true"[^>]*>דיור</);
    expect(html).toContain('>מתנה<');
    expect(html).toContain('>אחר<');
    expect(html).not.toContain('שם הקטגוריה');
  });

  it('a name of their own shows under "אחר", ready to edit', () => {
    const html = fields('variable', 'בייביסיטר');
    expect(html).toMatch(/data-selected="true"[^>]*>אחר</);
    expect(html).toContain('שם הקטגוריה');
    expect(html).toContain('value="בייביסיטר"');
  });

  it('a new cash income asks it, in place of the free-text category', () => {
    const html = renderToStaticMarkup(
      createElement(CashEntrySheet, { open: true, draft: emptyDraft('income', 'm1'), envelopes: [], members: [], wallets: [], incomeCategories: ['משכורת', 'דיור', 'קצבאות', 'מתנה'], onClose: () => {} }),
    );
    expect(html).toContain('איזו הכנסה זו?');
    expect(html).toContain('>מתנה<');
    expect(html).not.toContain('datalist');
  });

  it('an edit opens on the stored kind', () => {
    expect(actualDraft(cashIncome, null, 'm1', '2026-10-15')?.incomeKind).toBe('fixed');
  });

  it('the transaction sheet of a cash income offers it, when the page can open it', () => {
    const render = (onIncomeKind?: () => void) =>
      renderToStaticMarkup(
        createElement(TransactionSheet, {
          open: true, onClose: () => {}, walletName: 'ארנק ראשי', onCashAction: () => {}, onEditCash: () => {}, onSavings: () => {}, onDeleteCash: () => {},
          transaction: { actual: cashIncome, envelopeTitle: 'הכנסות במזומן', envelopeType: 'cashIncome', envelopeId: null },
          onIncomeKind,
        }),
      );
    expect(render(() => {})).toContain('איזו הכנסה זו?');
    expect(render()).not.toContain('איזו הכנסה זו?');
  });

  it('the sheet behind it: the income in green, the kind and the category, one button', () => {
    const html = renderToStaticMarkup(createElement(IncomeKindSheet, { actual: cashIncome, choices: ['משכורת', 'דיור', 'קצבאות', 'שיעורים פרטיים'], onClose: () => {} }));
    expect(html).toContain('data-type="cashIncome"');
    expect(html).toContain('600');
    expect(html).toMatch(/data-selected="true"[^>]*>שיעורים פרטיים</);
    expect(html).toContain('שמירה');
  });
});
