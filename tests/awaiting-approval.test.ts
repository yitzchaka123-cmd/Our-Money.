import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EnvelopeCard } from '@/app/dashboard/components/EnvelopeCard';
import { TransactionSheet } from '@/app/dashboard/components/TransactionSheet';
import { WalletCard } from '@/app/dashboard/components/WalletCard';
import { monthSnapshot } from '@/lib/assistant/context';
import { cashFlowsByMonth } from '@/lib/cash/inflow';
import { assembleMonth, buildWallet, monthTotals, type ActualRow, type DashboardData, type EnvelopeRow } from '@/lib/dashboard/data';
import { movementTransaction } from '@/lib/dashboard/movement-transaction';
import { countsAsSpent, totalsByMember, walletBalances, walletState } from '@/lib/reconcile';
import type { CashSpend, CashTopup, CashWallet } from '@/lib/types';

/**
 * C32: an entry waiting for "✅ לאשר" (ask-first mode, or the AI was unsure)
 * shows — greyed, "לאישור" — but counts nowhere until it is approved.
 */

const names = new Map([['m1', 'יצחק']]);
const main: CashWallet = { id: 'w-main', name: 'ארנק ראשי', member_id: null, is_default: true, is_archived: false, position: 0 };

const envelopeRows: EnvelopeRow[] = [
  { envelope_id: 'var', envelope_type: 'variable', name: null, planned_ils: 5000, position: 0 },
  { envelope_id: 'food', envelope_type: 'trackingCategory', name: 'אוכל בחוץ', planned_ils: 600, position: 1 },
  { envelope_id: 'inc', envelope_type: 'variableIncome', name: null, planned_ils: 12000, position: 2 },
];

function actual(envelope: string, id: string, amount: number, label: string | null = null, isIncome = false): ActualRow {
  return {
    envelope_id: envelope, transaction_id: id, transaction_date: '2026-09-05', billing_date: '2026-09-05',
    business_name: 'חנות', amount_ils: amount, is_income: isIncome, account_nickname: null, account_number_hash: null,
    source: null, is_installment: false, payment_number: null, total_payments: null, category_label: label,
  };
}
const actualRows = [actual('var', 'v1', 3000), actual('food', 'f1', 100, 'אוכל בחוץ'), actual('inc', 'i1', 12000, null, true)];

function spend(o: Partial<CashSpend> = {}): CashSpend {
  return {
    id: 's1', member_id: 'm1', amount_ils: 120, category: 'סופר', note: 'מכולת', spent_at: '2026-09-10',
    status: 'confirmed', confidence: 'high', input_kind: 'text', raw_input: null, transcript: null,
    telegram_update_id: null, telegram_chat_id: null, telegram_message_id: null, bot_message_id: null,
    envelope_id: null, envelope_type: null, wallet_id: null, plan_id: null, created_at: '2026-09-10T10:00:00Z', ...o,
  };
}
function topup(amount: number, o: Partial<CashTopup> = {}): CashTopup {
  return {
    id: 't1', amount_ils: amount, occurred_at: '2026-09-01', source: 'riseup_withdrawal', riseup_transaction_id: null,
    business_name: null, note: null, is_dismissed: false, member_id: null, category: null, input_kind: 'text',
    wallet_id: null, plan_id: null, ...o,
  };
}

function month(spends: CashSpend[]) {
  return assembleMonth({
    month: '2026-09', envelopeRows, actualRows, spends, topups: [], plans: [], skippedPlanIds: new Set(), memberNames: names,
  }).envelopes;
}

const waiting = spend({ status: 'needs_review' });

describe('an entry waiting for approval', () => {
  it('shows in its envelope but is not counted in it, nor in the totals and the forecast', () => {
    const before = month([]);
    const envelopes = month([waiting]);
    const variable = envelopes.find((e) => e.type === 'variable')!;
    expect(variable.actual).toBe(3000);
    expect(variable.actuals.some((a) => a.cash?.id === 's1')).toBe(false);
    expect(variable.awaiting?.map((a) => a.cash?.id)).toEqual(['s1']);
    expect(variable.awaiting?.[0]?.cash?.status).toBe('needs_review');
    expect(monthTotals(envelopes)).toEqual(monthTotals(before));
  });

  it('counts once it is approved', () => {
    const envelopes = month([{ ...waiting, status: 'confirmed' }]);
    const variable = envelopes.find((e) => e.type === 'variable')!;
    expect(variable.actual).toBe(3120);
    expect(variable.awaiting ?? []).toHaveLength(0);
    expect(monthTotals(envelopes).actualExpenses).toBe(monthTotals(month([])).actualExpenses + 120);
  });

  it('waits in the tracker its category names, without touching the tracker', () => {
    const envelopes = month([spend({ status: 'needs_review', category: 'אוכל בחוץ', amount_ils: 80 })]);
    const tracker = envelopes.find((e) => e.type === 'trackingCategory')!;
    expect(tracker.actual).toBe(100);
    expect(tracker.awaiting?.map((a) => a.amountIls)).toEqual([80]);
  });

  it('is not taken out of the wallet, nor counted as "יצא במזומן" or in the cash history', () => {
    const topups = [topup(500)];
    const confirmed = spend({ id: 's2', amount_ils: 40 });
    const wallet = buildWallet({
      wallets: [main], allTopups: topups, allSpends: [waiting, confirmed], allTransfers: [],
      monthTopups: topups, monthSpends: [waiting, confirmed], monthTransfers: [], memberNames: names, month: '2026-09',
    });
    expect(wallet.balance).toBe(460);
    expect(wallet.wallets[0]!.balance).toBe(460);
    expect(wallet.spent).toBe(40);
    expect(wallet.history?.at(-1)).toEqual({ month: '2026-09', in: 500, out: 40 });
    // Still listed among the month's movements, marked as waiting.
    expect(wallet.movements.find((m) => m.id === 's1')).toMatchObject({ kind: 'spend', awaiting: true });
    expect(wallet.movements.find((m) => m.id === 's2')?.awaiting).toBeFalsy();
  });

  it('is left out of every wallet sum the bot shares too', () => {
    expect(countsAsSpent(waiting)).toBe(false);
    expect(countsAsSpent(spend())).toBe(true);
    expect(countsAsSpent(spend({ status: 'deleted' }))).toBe(false);
    expect(walletState([topup(500)], [waiting]).unaccounted).toBe(500);
    expect(walletBalances([main], [topup(500)], [waiting], [])[0]!.balance).toBe(500);
    expect(totalsByMember([waiting]).size).toBe(0);
    expect(cashFlowsByMonth([], [waiting], ['2026-09'])[0]!.out).toBe(0);
  });

  it('is not in the assistant\'s sums, and the assistant knows it is waiting', () => {
    const envelopes = month([waiting]);
    const totals = monthTotals(envelopes);
    const data = {
      month: '2026-09', forecast: totals.forecast, totalActualExpenses: totals.actualExpenses,
      totalExpectedExpenses: totals.expectedExpenses, variableRemaining: 0, envelopes,
    } as unknown as DashboardData;
    const snapshot = monthSnapshot(data);
    expect(snapshot.transactions.some((t) => t.name === 'מכולת')).toBe(false);
    expect(snapshot.categories.some((c) => c.label === 'סופר')).toBe(false);
    expect(snapshot.awaiting).toEqual([expect.objectContaining({ name: 'מכולת', amount: 120 })]);
  });

  it('opens from the wallet as the same row its envelope shows', () => {
    const envelopes = month([waiting]);
    const wallet = buildWallet({
      wallets: [main], allTopups: [], allSpends: [waiting], allTransfers: [],
      monthTopups: [], monthSpends: [waiting], monthTransfers: [], memberNames: names,
    });
    const txn = movementTransaction(envelopes, wallet.movements[0]!);
    expect(txn?.envelopeType).toBe('variable');
    expect(txn?.actual.cash?.status).toBe('needs_review');
  });
});

describe('on screen', () => {
  const envelopes = month([waiting]);
  const variable = envelopes.find((e) => e.type === 'variable')!;

  it('the envelope breakdown lists it greyed, with "לאישור" and "לא נספר עד שתאשרו"', () => {
    const html = renderToStaticMarkup(
      createElement(EnvelopeCard, {
        type: variable.type, title: variable.title, actual: variable.actual, expected: variable.expected,
        actuals: variable.actuals, awaiting: variable.awaiting, month: '2026-09', today: '2026-09-20', defaultOpen: true,
      }),
    );
    expect(html).toContain('awaiting-block');
    expect(html).toContain('לאישור');
    expect(html).toContain('לא נספר עד שתאשרו');
    expect(html).toContain('מכולת');
  });

  it('the wallet lists it greyed with "לאישור"', () => {
    const wallet = buildWallet({
      wallets: [main], allTopups: [], allSpends: [waiting], allTransfers: [],
      monthTopups: [], monthSpends: [waiting], monthTransfers: [], memberNames: names,
    });
    const html = renderToStaticMarkup(createElement(WalletCard, { wallet, defaultOpen: true }));
    expect(html).toContain('is-awaiting');
    expect(html).toContain('לאישור');
  });

  it('the transaction sheet offers "✅ לאשר" for it, and only for it', () => {
    const sheet = (a: typeof variable.actuals[number]) =>
      renderToStaticMarkup(
        createElement(TransactionSheet, {
          open: true, onClose: () => {}, transaction: { actual: a, envelopeTitle: 'הוצאות משתנות', envelopeType: 'variable', envelopeId: 'var' },
          walletName: null, onCashAction: () => {}, onEditCash: () => {}, onSavings: () => {}, onDeleteCash: () => {}, onApprove: () => {},
        }),
      );
    expect(sheet(variable.awaiting![0]!)).toContain('<span>לאשר</span>');
    expect(sheet(variable.awaiting![0]!)).toContain('לא נספר עד שתאשרו');
    const confirmed = month([{ ...waiting, status: 'confirmed' }]).find((e) => e.type === 'variable')!.actuals.find((a) => a.cash)!;
    expect(sheet(confirmed)).not.toContain('<span>לאשר</span>');
    expect(sheet(confirmed)).not.toContain('לא נספר');
  });
});
