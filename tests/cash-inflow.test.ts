import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WalletCard } from '@/app/dashboard/components/WalletCard';
import { cashFlowsByMonth, inflowForecast, previousMonths } from '@/lib/cash/inflow';
import { buildWallet, type WalletView } from '@/lib/dashboard/data';
import type { CashSpend, CashTopup, CashWallet } from '@/lib/types';

function topup(amount: number, date: string, o: Partial<CashTopup> = {}): CashTopup {
  return {
    id: crypto.randomUUID(), amount_ils: amount, occurred_at: date, source: 'riseup_withdrawal', riseup_transaction_id: null,
    business_name: null, note: null, is_dismissed: false, member_id: null, category: null, input_kind: 'text', wallet_id: null, ...o,
  };
}
function spend(amount: number, date: string): CashSpend {
  return {
    id: crypto.randomUUID(), member_id: 'm1', amount_ils: amount, category: 'סופר', note: null, spent_at: date, status: 'confirmed',
    confidence: 'high', input_kind: 'text', raw_input: null, transcript: null, telegram_update_id: null, telegram_chat_id: null,
    telegram_message_id: null, bot_message_id: null, envelope_id: null, envelope_type: null, wallet_id: null, created_at: `${date}T10:00:00Z`,
  };
}

describe('previousMonths', () => {
  it('counts back across a new year, oldest first', () => {
    expect(previousMonths('2026-02', 3)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('cash in and out by month', () => {
  it('counts withdrawals and cash income in, spends out, and leaves balance updates out', () => {
    const flows = cashFlowsByMonth(
      [
        topup(1000, '2026-08-03'),
        topup(400, '2026-08-20', { source: 'manual' }),
        topup(300, '2026-09-10', { source: 'cash_income' }),
        topup(-200, '2026-09-11', { source: 'adjustment' }),
        topup(3540, '2026-09-12', { source: 'adjustment' }),
      ],
      [spend(120, '2026-08-05'), spend(80, '2026-09-01')],
      ['2026-08', '2026-09'],
    );
    expect(flows).toEqual([
      { month: '2026-08', in: 1400, out: 120 },
      { month: '2026-09', in: 300, out: 80 },
    ]);
  });
});

describe('expected cash in this month (V2-12)', () => {
  const history = [
    topup(1000, '2026-07-02'),
    topup(1500, '2026-08-02'),
    topup(200, '2026-08-15', { source: 'cash_income' }),
    topup(900, '2026-09-02'),
    topup(400, '2026-10-01'),
  ];

  it('is the average of the last three months of withdrawals and cash income', () => {
    const f = inflowForecast(history, [], '2026-10', null);
    // (1000 + 1700 + 900) / 3
    expect(f).toMatchObject({ month: '2026-10', predicted: 1200, basis: ['2026-07', '2026-08', '2026-09'], override: null, expected: 1200, arrived: 400 });
  });

  it('only averages months since cash was first recorded', () => {
    const f = inflowForecast([topup(600, '2026-09-04'), topup(100, '2026-10-02')], [], '2026-10', null);
    expect(f.predicted).toBe(600);
    expect(f.basis).toEqual(['2026-09']);
  });

  it('a month with only spending still counts, as a month with nothing in', () => {
    const f = inflowForecast([topup(900, '2026-09-02')], [spend(50, '2026-08-10')], '2026-10', null);
    expect(f.basis).toEqual(['2026-08', '2026-09']);
    expect(f.predicted).toBe(450);
  });

  it('with no history the guess is zero', () => {
    expect(inflowForecast([], [], '2026-10', null)).toMatchObject({ predicted: 0, basis: [], expected: 0 });
  });

  it('our own figure for the month replaces the guess', () => {
    const f = inflowForecast(history, [], '2026-10', 2500);
    expect(f).toMatchObject({ predicted: 1200, override: 2500, expected: 2500 });
  });
});

describe('the wallet carries the forecast and five months of history', () => {
  const main: CashWallet = { id: 'w-main', name: 'ארנק ראשי', member_id: null, is_default: true, is_archived: false, position: 0 };
  it('buildWallet adds them for the month shown', () => {
    const all = [topup(1000, '2026-07-02'), topup(1500, '2026-08-02'), topup(900, '2026-09-02'), topup(400, '2026-10-01')];
    const view = buildWallet({
      wallets: [main], allTopups: all, allSpends: [spend(100, '2026-09-03')], allTransfers: [],
      monthTopups: all.filter((t) => t.occurred_at.startsWith('2026-10')), monthSpends: [], monthTransfers: [],
      memberNames: new Map(), month: '2026-10', inflowOverride: null,
    });
    expect(view.inflow).toMatchObject({ expected: 1133, arrived: 400 });
    expect(view.history?.map((h) => h.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(view.history?.[3]).toEqual({ month: '2026-09', in: 900, out: 100 });
  });
});

describe('the wallet card shows it (V2-12)', () => {
  const base: WalletView = {
    balance: 2650, wallets: [{ id: 'w-main', name: 'ארנק ראשי', balance: 2650, isDefault: true, memberName: null }],
    withdrawn: 400, income: 0, spent: 0, movements: [],
  };
  const render = (wallet: WalletView) => renderToStaticMarkup(createElement(WalletCard, { wallet, onEditInflow: () => {} }));

  it('as "צפוי להיכנס החודש", from the average', () => {
    const html = render({ ...base, inflow: { month: '2026-10', predicted: 1200, basis: ['2026-07', '2026-08', '2026-09'], override: null, expected: 1200, arrived: 400 } });
    expect(html).toContain('צפוי להיכנס החודש');
    expect(html).toContain('1,200');
    expect(html).toContain('לפי ממוצע 3 החודשים האחרונים');
  });

  it('says when the figure is ours', () => {
    const html = render({ ...base, inflow: { month: '2026-10', predicted: 1200, basis: ['2026-09'], override: 2500, expected: 2500, arrived: 400 } });
    expect(html).toContain('2,500');
    expect(html).toContain('עדכנתם את הצפי');
  });
});
