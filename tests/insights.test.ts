import { describe, expect, it } from 'vitest';

import { insightText } from '@/lib/dashboard/brief';
import type { EnvelopeView, PendingPlanView } from '@/lib/dashboard/data';
import {
  bigChargeInsight,
  cashLowInsight,
  computeInsights,
  forecastInsight,
  incomeInsight,
  trackerInsights,
  weekStart,
  type Insight,
  type InsightInput,
} from '@/lib/dashboard/insights';
import type { NormalizedActual } from '@/lib/riseup/envelopes';

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

function envelope(type: EnvelopeView['type'], title: string, actuals: NormalizedActual[], extra: Partial<EnvelopeView> = {}): EnvelopeView {
  const total = actuals.reduce((s, a) => s + a.amountIls, 0);
  return {
    key: title,
    envelopeId: title,
    type,
    title,
    actual: total,
    expected: total,
    actuals,
    showRemaining: false,
    pending: [],
    pendingTotal: 0,
    ...extra,
  };
}

function plan(amount: number, label = 'עוזרת בית'): PendingPlanView {
  return {
    planId: label,
    kind: 'spend',
    amountIls: amount,
    date: '2026-10-20',
    label,
    category: label,
    note: null,
    memberName: null,
    memberId: null,
    walletId: null,
    recurrence: 'monthly',
    envelopeId: 'var',
  };
}

/** Sunday 11 October 2026. */
const TODAY = '2026-10-11';

function input(extra: Partial<InsightInput> = {}): InsightInput {
  return {
    today: TODAY,
    month: '2026-10',
    envelopes: [],
    trackers: [],
    forecast: -10217,
    yesterdayForecast: null,
    wallet: { balance: 600, wallets: [{ name: 'ארנק ראשי', balance: 600 }] },
    baselineExpenses: [40, 60, 80, 90, 100, 120, 35, 55],
    ...extra,
  };
}

const text = (insight: Insight | null | undefined) => (insight ? `${insight.title} ${insightText({ text: insight.body })}` : '');

describe('weekStart', () => {
  it('starts the week on Sunday, as RiseUp counts weeks', () => {
    expect(weekStart('2026-10-11')).toBe('2026-10-11');
    expect(weekStart('2026-10-14')).toBe('2026-10-11');
    expect(weekStart('2026-10-10')).toBe('2026-10-04');
  });
});

describe('bigChargeInsight', () => {
  const week = (...actuals: NormalizedActual[]) =>
    input({ today: '2026-10-14', envelopes: [envelope('variable', 'הוצאות משתנות', actuals)] });

  it('picks the biggest charge this week when it is far above a usual one', () => {
    const insight = bigChargeInsight(
      week(actual('a', '2026-10-12', 900, 'איקאה'), actual('b', '2026-10-13', 1450, 'מחסני חשמל'), actual('c', '2026-10-13', 30, 'ארומה')),
    );
    expect(insight?.key).toBe('big-charge:b');
    expect(text(insight)).toBe('הוצאה גדולה השבוע: 1,450 ₪ ב-מחסני חשמל, בערך פי 20 מהוצאה רגילה אצלכם.');
    expect(insightText({ text: insight!.detail.paragraphs[1]! })).toContain('בסביבות 70 ₪');
  });

  it('ignores last week, fixed charges and income', () => {
    const insight = bigChargeInsight(
      input({
        today: '2026-10-14',
        envelopes: [
          envelope('variable', 'הוצאות משתנות', [actual('old', '2026-10-10', 3000, 'טיסה')]),
          envelope('fixed', 'הוצאות קבועות', [actual('rent', '2026-10-12', 5000, 'שכירות')]),
          envelope('variableIncome', 'הכנסות', [actual('sal', '2026-10-12', 9000, 'משכורת', { isIncome: true })]),
        ],
      }),
    );
    expect(insight).toBeNull();
  });

  it('needs a real baseline and a real size', () => {
    expect(bigChargeInsight({ ...week(actual('a', '2026-10-12', 1450, 'x')), baselineExpenses: [100, 200] })).toBeNull();
    expect(bigChargeInsight(week(actual('a', '2026-10-12', 350, 'x')))).toBeNull();
  });

  it('counts cash in a tracker too', () => {
    const insight = bigChargeInsight(
      input({
        today: '2026-10-14',
        envelopes: [
          envelope('trackingCategory', 'ביגוד והנעלה', [
            actual('cash:s1', '2026-10-12', 800, 'נעליים', {
              cash: { id: 's1', kind: 'spend', memberName: 'שרה', inputKind: 'text', status: 'confirmed', walletId: null },
            }),
          ]),
        ],
      }),
    );
    expect(insight?.key).toBe('big-charge:cash:s1');
    expect(insightText({ text: insight!.detail.paragraphs[0]! })).toContain('(במזומן)');
  });
});

describe('trackerInsights', () => {
  it('flags a tracker that has gone past its target', () => {
    const [insight] = trackerInsights(input({ trackers: [{ name: 'פארמה', planned: 450, actual: 520 }] }));
    expect(insight?.key).toBe('tracker-over:2026-10:פארמה');
    expect(text(insight)).toBe('פארמה: עברתם את היעד החודשי. יצאו 520 ₪ מתוך יעד של 450 ₪ — 70 ₪ מעל.');
  });

  it('flags a tracker running well ahead of the month', () => {
    // 11 of 31 days gone (35%), 300 of 450 spent (67%).
    const [insight] = trackerInsights(input({ trackers: [{ name: 'פארמה', planned: 450, actual: 300 }] }));
    expect(insight?.key).toBe('tracker-pace:2026-10:פארמה');
    expect(text(insight)).toBe('פארמה בקצב מהיר מהרגיל: כבר יצאו 300 ₪ מתוך 450 ₪, ועברו רק 35% מהחודש.');
    expect(insightText({ text: insight!.detail.paragraphs[0]! })).toBe('בקצב הזה תגיעו לכ-845 ₪ עד סוף החודש, 395 ₪ מעל היעד.');
  });

  it('stays quiet on pace, near the end of the month, and with no target', () => {
    expect(trackerInsights(input({ trackers: [{ name: 'פארמה', planned: 450, actual: 150 }] }))).toEqual([]);
    expect(trackerInsights(input({ today: '2026-10-29', trackers: [{ name: 'פארמה', planned: 450, actual: 440 }] }))).toEqual([]);
    expect(trackerInsights(input({ trackers: [{ name: 'רכב', planned: 0, actual: 300 }] }))).toEqual([]);
  });
});

describe('incomeInsight', () => {
  const income = (date: string, amount: number) =>
    input({
      envelopes: [
        envelope('variableIncome', 'הכנסות', [actual('sal', date, amount, 'העברת משכורת', { isIncome: true })], { expected: 7635 }),
      ],
    });

  it('says income arrived in the last three days', () => {
    const insight = incomeInsight(income('2026-10-09', 7635));
    expect(insight?.key).toBe('income:sal');
    expect(text(insight)).toBe('נכנסה הכנסה: 7,635 ₪ מ-העברת משכורת.');
    expect(insightText({ text: insight!.detail.paragraphs[1]! })).toBe('עד עכשיו נכנסו החודש 7,635 ₪ מתוך 7,635 ₪ שצפויים להיכנס.');
  });

  it('ignores older and small income', () => {
    expect(incomeInsight(income('2026-10-05', 7635))).toBeNull();
    expect(incomeInsight(income('2026-10-10', 120))).toBeNull();
  });
});

describe('cashLowInsight', () => {
  const withPlans = (balance: number, ...plans: PendingPlanView[]) =>
    input({
      wallet: { balance, wallets: [{ name: 'ארנק ראשי', balance }] },
      envelopes: [envelope('variable', 'הוצאות משתנות', [], { pending: plans, pendingTotal: plans.reduce((s, p) => s + p.amountIls, 0) })],
    });

  it('warns when the wallets hold less than the cash still planned this month', () => {
    const insight = cashLowInsight(withPlans(300, plan(800), plan(150, 'ועד בית')));
    expect(insight?.key).toBe('cash-low:2026-10');
    expect(text(insight)).toBe('המזומן בארנקים לא יספיק: יש בהם 300 ₪, ועד סוף החודש מתוכננות הוצאות במזומן של 950 ₪.');
    expect(insightText({ text: insight!.detail.next })).toBe('כדאי למשוך עוד 650 ₪, או לעדכן את התשלומים המתוכננים.');
  });

  it('is quiet when there is enough, or nothing planned', () => {
    expect(cashLowInsight(withPlans(1000, plan(800)))).toBeNull();
    expect(cashLowInsight(withPlans(0))).toBeNull();
  });
});

describe('forecastInsight', () => {
  it('says the forecast fell since yesterday, with both figures', () => {
    const insight = forecastInsight(input({ forecast: -10217, yesterdayForecast: -9400 }));
    expect(insight?.key).toBe('forecast:2026-10-11');
    expect(text(insight)).toBe('תחזית סוף החודש ירדה: ב-817 ₪ מאתמול, ל-‎-10,217 ₪.');
    expect(insightText({ text: insight!.detail.paragraphs[0]! })).toBe(
      'אתמול התחזית לסוף אוקטובר הייתה ‎-9,400 ₪, והיום היא ‎-10,217 ₪.',
    );
  });

  it('says when it improved', () => {
    expect(forecastInsight(input({ forecast: 1200, yesterdayForecast: 500 }))?.title).toBe('תחזית סוף החודש השתפרה:');
  });

  it('ignores small moves and a missing yesterday', () => {
    expect(forecastInsight(input({ forecast: -10217, yesterdayForecast: -10180 }))).toBeNull();
    expect(forecastInsight(input({ yesterdayForecast: null }))).toBeNull();
  });
});

describe('computeInsights', () => {
  const busy = input({
    forecast: -10217,
    yesterdayForecast: -9400,
    trackers: [{ name: 'פארמה', planned: 450, actual: 520 }],
  });

  it('orders the cards and leaves out the dismissed ones for good', () => {
    expect(computeInsights(busy, new Map()).map((i) => i.key)).toEqual(['forecast:2026-10-11', 'tracker-over:2026-10:פארמה']);
    const feedback = new Map([['forecast:2026-10-11', { dismissed: true, helpful: null }]]);
    expect(computeInsights(busy, feedback).map((i) => i.key)).toEqual(['tracker-over:2026-10:פארמה']);
  });

  it('remembers a yes or no answer', () => {
    const feedback = new Map([['tracker-over:2026-10:פארמה', { dismissed: false, helpful: true }]]);
    expect(computeInsights(busy, feedback).find((i) => i.kind === 'tracker-over')?.helpful).toBe(true);
  });
});
