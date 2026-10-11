import { describe, expect, it } from 'vitest';

import {
  buildBrief,
  insightText,
  merchantInsight,
  trackerInsight,
  type BriefEnvelope,
  type BriefSource,
  type HistoryTxn,
  type RiseupRow,
} from '@/lib/dashboard/brief';
import type { NormalizedActual } from '@/lib/riseup/envelopes';
import type { CashSpend, CashTopup } from '@/lib/types';

const txn = (id: string, date: string, amount: number, business = 'חברת חשמל', isIncome = false): HistoryTxn => ({
  id,
  date,
  business,
  amount,
  isIncome,
});

/** Six months of history so "first time" claims are allowed. */
const OLD = txn('old', '2026-03-01', 50, 'מכולת ותיקה');

describe('merchantInsight', () => {
  it('says how much higher than usual, against the median of earlier charges', () => {
    const history = [OLD, txn('a', '2026-07-06', 680), txn('b', '2026-08-06', 690), txn('c', '2026-09-06', 682.8)];
    const insight = merchantInsight(txn('new', '2026-10-06', 768.99), history);
    expect(insight?.rule).toBe('higher');
    expect(insightText(insight!)).toBe('זיהינו שההוצאה הזו גבוהה ב-86.19 ₪ מהרגיל. בדרך כלל יוצאים כאן 682.80 ₪.');
  });

  it('says how much lower than usual', () => {
    const history = [OLD, txn('a', '2026-08-06', 400), txn('b', '2026-09-06', 400)];
    const insight = merchantInsight(txn('new', '2026-10-06', 300), history);
    expect(insight?.rule).toBe('lower');
    expect(insightText(insight!)).toContain('נמוכה ב-100 ₪ מהרגיל');
  });

  it('stays quiet when the charge is within the usual range', () => {
    const history = [OLD, txn('a', '2026-08-06', 400), txn('b', '2026-09-06', 410)];
    expect(merchantInsight(txn('new', '2026-10-06', 412), history)).toBeNull();
  });

  it('needs two earlier charges before it calls anything usual', () => {
    const history = [OLD, txn('a', '2026-09-06', 100)];
    expect(merchantInsight(txn('new', '2026-10-06', 400), history)?.rule).not.toBe('higher');
  });

  it('ignores later charges and the charge itself when working out what is usual', () => {
    const history = [OLD, txn('a', '2026-08-06', 100), txn('b', '2026-09-06', 100), txn('later', '2026-10-20', 900)];
    const target = txn('new', '2026-10-06', 100);
    expect(merchantInsight(target, [...history, target])).toBeNull();
  });

  it('counts the charges this month at the same business from the third on', () => {
    const history = [
      OLD,
      txn('a', '2026-10-01', 30, 'ארומה'),
      txn('b', '2026-10-03', 32, 'ארומה'),
      txn('c', '2026-09-28', 30, 'ארומה'),
    ];
    const insight = merchantInsight(txn('new', '2026-10-05', 31, 'ארומה'), history);
    expect(insight?.rule).toBe('nth-this-month');
    expect(insightText(insight!)).toBe('זו הפעם ה-3 החודש שיש חיוב ב-ארומה.');
  });

  it('matches business names regardless of case and spacing', () => {
    const history = [OLD, txn('a', '2026-10-01', 30, 'AROMA  TLV'), txn('b', '2026-10-02', 30, 'aroma tlv')];
    expect(merchantInsight(txn('new', '2026-10-05', 30, 'Aroma TLV'), history)?.rule).toBe('nth-this-month');
  });

  it('calls a business new only when two months of history say so', () => {
    const target = txn('new', '2026-10-05', 120, 'חנות חדשה');
    expect(merchantInsight(target, [OLD, target])?.rule).toBe('first-time');
    expect(insightText(merchantInsight(target, [OLD])!)).toBe('זו הפעם הראשונה שאנחנו רואים חיוב ב-חנות חדשה.');
    // History only goes back a few weeks: no claim either way.
    expect(merchantInsight(target, [txn('x', '2026-09-20', 10, 'אחר')])).toBeNull();
  });

  it('words income as income', () => {
    const history = [OLD, txn('a', '2026-08-08', 7000, 'משכורת', true), txn('b', '2026-09-08', 7000, 'משכורת', true)];
    const insight = merchantInsight(txn('new', '2026-10-08', 7800, 'משכורת', true), history);
    expect(insightText(insight!)).toBe('ההכנסה הזו גבוהה ב-800 ₪ מהרגיל. בדרך כלל נכנסים 7,000 ₪.');
    expect(insightText(merchantInsight(txn('n', '2026-10-08', 900, 'מקור חדש', true), [OLD])!)).toBe(
      'זו הפעם הראשונה שנכנס כסף מ-מקור חדש.',
    );
  });

  it('never compares an income with an expense at the same name', () => {
    const history = [OLD, txn('a', '2026-08-08', 50, 'ביט'), txn('b', '2026-09-08', 50, 'ביט')];
    expect(merchantInsight(txn('new', '2026-10-08', 500, 'ביט', true), history)?.rule).toBe('first-time');
  });
});

describe('trackerInsight', () => {
  const tracker = (actuals: Array<[string, string, number]>, planned = 450) => ({
    name: 'פארמה',
    planned,
    actuals: actuals.map(([id, date, amount]) => ({ id, date, amount })),
  });

  it('says when this charge is the one that crossed the target', () => {
    const t = tracker([['a', '2026-10-02', 300], ['b', '2026-10-06', 200]]);
    const insight = trackerInsight({ id: 'b', date: '2026-10-06', amount: 200 }, t);
    expect(insight?.rule).toBe('tracker-crossed');
    expect(insightText(insight!)).toBe('ההוצאה הזו העבירה את פארמה מעל היעד החודשי ב-50 ₪.');
  });

  it('says how far over it stands when the target was already behind', () => {
    const t = tracker([['a', '2026-10-02', 500], ['b', '2026-10-06', 40]]);
    const insight = trackerInsight({ id: 'b', date: '2026-10-06', amount: 40 }, t);
    expect(insight?.rule).toBe('tracker-over');
    expect(insightText(insight!)).toBe('עם ההוצאה הזו, פארמה כבר 90 ₪ מעל היעד החודשי.');
  });

  it('only counts charges up to this one, not ones that came later', () => {
    const t = tracker([['a', '2026-10-02', 100], ['b', '2026-10-06', 50], ['c', '2026-10-09', 400]]);
    const insight = trackerInsight({ id: 'b', date: '2026-10-06', amount: 50 }, t);
    expect(insight).toBeNull();
  });

  it('warns when little is left of the target', () => {
    const t = tracker([['a', '2026-10-02', 300], ['b', '2026-10-06', 100]]);
    const insight = trackerInsight({ id: 'b', date: '2026-10-06', amount: 100 }, t);
    expect(insight?.rule).toBe('tracker-near');
    expect(insightText(insight!)).toBe('עם ההוצאה הזו נשארו 50 ₪ ב-פארמה עד סוף החודש.');
  });

  it('has nothing to say about a tracker with no target', () => {
    expect(trackerInsight({ id: 'a', date: '2026-10-02', amount: 900 }, tracker([['a', '2026-10-02', 900]], 0))).toBeNull();
  });
});

// ---------------------------------------------------------------------------

function actual(id: string, date: string, amount: number, business: string, extra: Partial<NormalizedActual> = {}): NormalizedActual {
  return {
    transactionId: id,
    transactionDate: date,
    billingDate: date,
    businessName: business,
    amountIls: amount,
    isIncome: false,
    accountNickname: null,
    accountNumberHash: null,
    source: null,
    isInstallment: false,
    paymentNumber: null,
    totalPayments: null,
    categoryLabel: null,
    ...extra,
  };
}

function row(id: string, date: string, amount: number, business: string, firstSeen: string, extra: Partial<RiseupRow> = {}): RiseupRow {
  return {
    transaction_id: id,
    transaction_date: date,
    cashflow_month: date.slice(0, 7),
    business_name: business,
    amount_ils: amount,
    is_income: false,
    account_nickname: null,
    account_number_hash: '7722',
    category_label: null,
    is_withdrawal: false,
    first_seen_at: firstSeen,
    ...extra,
  };
}

function spend(id: string, extra: Partial<CashSpend> = {}): CashSpend {
  return {
    id,
    member_id: 'm2',
    amount_ils: 45,
    category: 'תחבורה',
    note: 'מונית',
    spent_at: '2026-10-07',
    status: 'confirmed',
    confidence: 'high',
    input_kind: 'voice',
    raw_input: null,
    transcript: null,
    telegram_update_id: null,
    telegram_chat_id: null,
    telegram_message_id: null,
    bot_message_id: null,
    envelope_id: null,
    envelope_type: null,
    wallet_id: 'w1',
    created_at: '2026-10-07T09:00:00Z',
    ...extra,
  };
}

const october: BriefEnvelope[] = [
  {
    envelopeId: 'fix',
    type: 'fixed',
    title: 'הוצאות קבועות',
    planned: 5000,
    actuals: [actual('elec', '2026-10-06', 768.99, 'בזק (ENERGY בזק ג׳ן)', { categoryLabel: 'חשמל', accountNumberHash: '7722' })],
  },
  {
    envelopeId: 'inc',
    type: 'variableIncome',
    title: 'הכנסות',
    planned: 7635,
    actuals: [actual('salary', '2026-10-08', 7635, 'העברת משכורת', { isIncome: true, accountNumberHash: '674-1908922' })],
  },
  {
    envelopeId: 'var',
    type: 'variable',
    title: 'הוצאות משתנות',
    planned: 3000,
    actuals: [
      actual('cash:s1', '2026-10-07', 45, 'מונית', {
        source: 'cash',
        accountNickname: 'מזומן',
        categoryLabel: 'תחבורה',
        cash: { id: 's1', kind: 'spend', memberName: 'שרה', inputKind: 'voice', status: 'confirmed', walletId: 'w1' },
      }),
    ],
  },
];

function source(extra: Partial<BriefSource> = {}): BriefSource {
  return {
    asOf: '2026-10-11T08:00:00Z',
    seenUntil: '2026-10-05T20:00:00Z',
    newRiseup: [
      row('salary', '2026-10-08', 7635, 'העברת משכורת', '2026-10-09T05:00:00Z', { is_income: true, account_number_hash: '674-1908922' }),
      row('elec', '2026-10-06', 768.99, 'בזק (ENERGY בזק ג׳ן)', '2026-10-07T05:00:00Z', { category_label: 'חשמל' }),
    ],
    history: [
      txn('h0', '2026-04-06', 10, 'משהו ישן'),
      txn('h3', '2026-07-06', 690, 'בזק (ENERGY בזק ג׳ן)'),
      txn('h1', '2026-08-06', 680, 'בזק (ENERGY בזק ג׳ן)'),
      txn('h2', '2026-09-06', 682.8, 'בזק (ENERGY בזק ג׳ן)'),
      txn('elec', '2026-10-06', 768.99, 'בזק (ENERGY בזק ג׳ן)'),
    ],
    envelopesByMonth: { '2026-10': october },
    cashSpends: [spend('s1')],
    cashTopups: [],
    withdrawalTopups: [],
    wallets: [{ id: 'w1', name: 'ארנק ראשי', isDefault: true }],
    memberNames: new Map([['m1', 'יצחק'], ['m2', 'שרה']]),
    ...extra,
  };
}

describe('buildBrief', () => {
  it('makes one card per new charge and cash entry, oldest first, with a true count', () => {
    const brief = buildBrief(source());
    expect(brief.count).toBe(3);
    expect(brief.items.map((i) => i.key)).toEqual(['riseup:elec', 'cash-spend:s1', 'riseup:salary']);
  });

  it('dresses a RiseUp charge as RiseUp does: envelope and category, card, insight', () => {
    const [elec] = buildBrief(source()).items;
    expect(elec).toMatchObject({
      label: 'הוצאות קבועות · חשמל',
      envelopeType: 'fixed',
      amountIls: 768.99,
      business: 'בזק (ENERGY בזק ג׳ן)',
      date: '2026-10-06',
      account: 'כרטיס 7722',
      needsReview: false,
    });
    expect(insightText(elec!.insight!)).toContain('גבוהה ב-86.19 ₪ מהרגיל');
  });

  it('shows who logged a cash entry and from which wallet', () => {
    const cash = buildBrief(source()).items[1]!;
    expect(cash).toMatchObject({ kind: 'cash-spend', label: 'מזומן · הוצאות משתנות · תחבורה', account: 'מזומן · ארנק ראשי', memberName: 'שרה' });
  });

  it('labels income with its account', () => {
    const salary = buildBrief(source()).items[2]!;
    expect(salary).toMatchObject({ label: 'הכנסות משתנות', envelopeType: 'variableIncome', account: 'חשבון 674-1908922' });
  });

  it('leaves out cash logged before the last read, but keeps any still waiting for review', () => {
    const brief = buildBrief(
      source({
        newRiseup: [],
        cashSpends: [
          spend('old', { created_at: '2026-10-01T09:00:00Z' }),
          spend('review', { created_at: '2026-10-01T09:00:00Z', status: 'needs_review' }),
          spend('gone', { status: 'deleted' }),
        ],
      }),
    );
    expect(brief.items.map((i) => i.key)).toEqual(['cash-spend:review']);
    expect(brief.items[0]!.needsReview).toBe(true);
    expect(insightText(brief.items[0]!.insight!)).toContain('לא היה בטוח');
  });

  it('includes new cash income and hand-typed withdrawals, never the bank withdrawals twice', () => {
    const topup = (id: string, source: CashTopup['source'], extra: Partial<CashTopup> = {}): CashTopup => ({
      id,
      amount_ils: 200,
      occurred_at: '2026-10-09',
      source,
      riseup_transaction_id: null,
      business_name: null,
      note: null,
      is_dismissed: false,
      member_id: 'm1',
      category: 'מתנה',
      input_kind: 'text',
      wallet_id: 'w1',
      created_at: '2026-10-09T10:00:00Z',
      ...extra,
    });
    const brief = buildBrief(
      source({
        newRiseup: [],
        cashSpends: [],
        cashTopups: [topup('gift', 'cash_income'), topup('atm-hand', 'manual'), topup('atm-bank', 'riseup_withdrawal')],
      }),
    );
    expect(brief.items.map((i) => [i.key, i.label])).toEqual([
      ['cash-income:gift', 'הכנסה במזומן'],
      ['cash-withdrawal:atm-hand', 'משיכת מזומן'],
    ]);
  });

  it('says which wallet a bank withdrawal went into', () => {
    const brief = buildBrief(
      source({
        newRiseup: [row('atm', '2026-10-09', 500, 'משיכת מזומן', '2026-10-10T05:00:00Z', { is_withdrawal: true })],
        cashSpends: [],
        withdrawalTopups: [
          {
            id: 't1', amount_ils: 500, occurred_at: '2026-10-09', source: 'riseup_withdrawal', riseup_transaction_id: 'atm',
            business_name: 'משיכת מזומן', note: null, is_dismissed: false, member_id: null, category: null, input_kind: null, wallet_id: 'w1',
          },
        ],
      }),
    );
    expect(brief.items).toHaveLength(1);
    expect(brief.items[0]).toMatchObject({ label: 'משיכת מזומן', envelopeType: 'withdrawal' });
    expect(insightText(brief.items[0]!.insight!)).toBe('המשיכה נרשמה כמזומן ב-ארנק ראשי.');
  });

  it('files a charge the budget does not list yet by its direction', () => {
    const brief = buildBrief(
      source({
        newRiseup: [row('late', '2026-10-10', 60, 'סופר', '2026-10-11T05:00:00Z', { category_label: 'מזון' })],
        cashSpends: [],
        envelopesByMonth: {},
      }),
    );
    expect(brief.items[0]).toMatchObject({ envelopeType: 'variable', label: 'הוצאות משתנות · מזון' });
  });

  it('is empty when nothing is new', () => {
    const brief = buildBrief(source({ newRiseup: [], cashSpends: [] }));
    expect(brief).toMatchObject({ count: 0, items: [] });
  });
});
