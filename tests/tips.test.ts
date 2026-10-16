import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { InsightCards } from '@/app/dashboard/components/InsightCards';
import type { EnvelopeView } from '@/lib/dashboard/data';
import type { InsightFeedback, InsightInput } from '@/lib/dashboard/insights';
import { selectTips, TIPS, tipFacts, tipInsight, withTips, type Tip, type TipFacts } from '@/lib/dashboard/tips';
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

function envelope(type: EnvelopeView['type'], title: string, actuals: NormalizedActual[]): EnvelopeView {
  const total = actuals.reduce((s, a) => s + a.amountIls, 0);
  return { key: title, envelopeId: title, type, title, actual: total, expected: total, actuals, showRemaining: false, pending: [], pendingTotal: 0 };
}

/** Sunday 11 October 2026. */
const TODAY = '2026-10-11';

function input(extra: Partial<InsightInput> = {}): InsightInput {
  return {
    today: TODAY,
    month: '2026-10',
    envelopes: [],
    trackers: [],
    forecast: 1200,
    yesterdayForecast: null,
    wallet: { balance: 600, wallets: [{ name: 'ארנק ראשי', balance: 600 }] },
    baselineExpenses: [],
    ...extra,
  };
}

const quiet: TipFacts = tipFacts(input());
const at = (day: string) => `${day}T06:00:00Z`;

describe('the tip library (V4-10)', () => {
  it('has about a hundred tips, each with a unique id, a title and a short body', () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(95);
    expect(new Set(TIPS.map((t) => t.id)).size).toBe(TIPS.length);
    for (const tip of TIPS) {
      expect(tip.title.trim(), tip.id).not.toBe('');
      expect(tip.body.length, tip.id).toBeLessThanOrEqual(200);
      // Hebrew, in our own words.
      expect(tip.body, tip.id).toMatch(/[א-ת]/);
    }
  });

  it('ties a good share of them to the household’s own numbers', () => {
    expect(TIPS.filter((t) => t.when).length).toBeGreaterThanOrEqual(30);
  });

  it('never pushes a financial product', () => {
    const banned = /(השקיעו|תשקיעו|קרן נאמנות|מניות|קריפטו|ביטקוין|הלוואה חוץ|קחו הלוואה|תיק השקעות)/;
    for (const tip of TIPS) expect(`${tip.title} ${tip.body} ${tip.next ?? ''}`, tip.id).not.toMatch(banned);
  });
});

describe('tipFacts', () => {
  it('reads eating out above its target from a tracker by its name', () => {
    const facts = tipFacts(input({ trackers: [{ name: 'אוכל בחוץ', planned: 600, actual: 750 }] }));
    expect(facts.eatingOutOver).toBe(true);
    expect(tipFacts(input({ trackers: [{ name: 'אוכל בחוץ', planned: 600, actual: 300 }] })).eatingOutOver).toBe(false);
  });

  it('counts many small card charges, but not cash or income', () => {
    const small = Array.from({ length: 16 }, (_, i) => actual(`s${i}`, '2026-10-05', 18, 'קיוסק'));
    expect(tipFacts(input({ envelopes: [envelope('variable', 'הוצאות משתנות', small)] })).manySmallCharges).toBe(true);
    const cash = small.map((a) => ({ ...a, cash: { id: a.transactionId, kind: 'spend' as const, memberName: null, inputKind: 'text' as const, status: 'confirmed' as const, walletId: null } }));
    expect(tipFacts(input({ envelopes: [envelope('variable', 'הוצאות משתנות', cash)] })).manySmallCharges).toBe(false);
  });

  it('sees negative cash, a negative forecast, salary that just arrived, weekends, subscriptions and fees', () => {
    const facts = tipFacts(
      input({
        forecast: -2500,
        wallet: { balance: -90, wallets: [{ name: 'ארנק ראשי', balance: -90 }] },
        envelopes: [
          envelope('variableIncome', 'הכנסות', [actual('sal', '2026-10-10', 7635, 'העברת משכורת', { isIncome: true })]),
          // Friday and Saturday.
          envelope('variable', 'הוצאות משתנות', [actual('f', '2026-10-09', 600, 'מסעדה'), actual('s', '2026-10-10', 300, 'קניון'), actual('m', '2026-10-05', 200, 'מכולת')]),
          envelope('fixed', 'הוצאות קבועות', [
            actual('n', '2026-10-02', 55, 'NETFLIX.COM'),
            actual('sp', '2026-10-03', 20, 'Spotify'),
            actual('fee', '2026-10-01', 12.9, 'עמלת פעולה בערוץ ישיר'),
          ]),
        ],
      }),
    );
    expect(facts).toMatchObject({
      forecastNegative: true,
      cashNegative: true,
      salaryJustArrived: true,
      weekendHeavy: true,
      subscriptions: 2,
      feesSeen: true,
    });
  });
});

describe('selectTips', () => {
  const general = (id: string): Tip => ({ id, art: 'tip-bulb', title: id, body: 'טיפ' });
  const library: Tip[] = [
    general('g1'),
    { id: 'eat', art: 'tip-cup', title: 'אוכל בחוץ', body: 'טיפ', when: (f) => f.eatingOutOver },
    general('g2'),
    general('g3'),
  ];
  const eating = { ...quiet, eatingOutOver: true };

  it('puts tips about the household’s own numbers first, then general ones', () => {
    expect(selectTips(library, eating, new Map(), TODAY, 2).map((t) => t.id)).toEqual(['eat', 'g1']);
    expect(selectTips(library, quiet, new Map(), TODAY, 2).map((t) => t.id)).toEqual(['g1', 'g2']);
  });

  it('never shows a tip whose condition does not hold', () => {
    expect(selectTips(library, quiet, new Map(), TODAY, 10).map((t) => t.id)).not.toContain('eat');
  });

  it('keeps today’s tips all day, and moves on to new ones the next day', () => {
    const feedback: InsightFeedback = new Map([
      ['tip:g1', { dismissed: false, helpful: null, seenAt: at(TODAY) }],
      ['tip:g2', { dismissed: false, helpful: null, seenAt: at(TODAY) }],
    ]);
    expect(selectTips(library, quiet, feedback, TODAY, 2).map((t) => t.id)).toEqual(['g1', 'g2']);
    expect(selectTips(library, quiet, feedback, '2026-10-12', 2).map((t) => t.id)).toEqual(['g3']);
  });

  it('does not replace a tip dismissed or opened today with another one the same day', () => {
    const feedback: InsightFeedback = new Map([
      ['tip:g1', { dismissed: true, helpful: null, seenAt: at(TODAY) }],
      ['tip:g2', { dismissed: false, helpful: null, seenAt: at(TODAY), openedAt: at(TODAY) }],
    ]);
    expect(selectTips(library, quiet, feedback, TODAY, 2)).toEqual([]);
  });

  it('shows each tip once, ever', () => {
    const feedback: InsightFeedback = new Map(library.map((t) => [`tip:${t.id}`, { dismissed: false, helpful: null, seenAt: at('2026-09-01') }]));
    expect(selectTips(library, eating, feedback, TODAY, 2)).toEqual([]);
  });
});

describe('withTips', () => {
  it('adds two tips after the data cards, or one when there are already three or more', () => {
    const none = withTips([], input(), new Map());
    expect(none.map((c) => c.kind)).toEqual(['tip', 'tip']);
    const busy = withTips(
      [1, 2, 3].map((n) => ({ ...tipInsight(TIPS[0]!), key: `forecast:${n}`, kind: 'forecast' as const })),
      input(),
      new Map(),
    );
    expect(busy.map((c) => c.kind)).toEqual(['forecast', 'forecast', 'forecast', 'tip']);
  });

  it('turns a tip into a card with its "מה עכשיו?" line', () => {
    const tip: Tip = { id: 'x', art: 'tip-plant', title: 'כותרת', body: 'גוף.', next: 'צעד.' };
    expect(tipInsight(tip)).toMatchObject({
      key: 'tip:x',
      kind: 'tip',
      art: 'tip-plant',
      title: 'כותרת',
      body: ['גוף.'],
      detail: { heading: 'כותרת', paragraphs: [['גוף.']], next: ['צעד.'] },
    });
    expect(tipInsight({ ...tip, next: undefined }).detail.next).toEqual([]);
  });
});

describe('a tip in the carousel', () => {
  const render = (tip: Tip) =>
    renderToStaticMarkup(createElement(InsightCards, { insights: [tipInsight(tip)], initialOpenKey: `tip:${tip.id}` }));

  it('shows its drawing, title, sentence and a popup with "מה עכשיו?" and "זה עזר לך?"', () => {
    const html = render({ id: 'x', art: 'tip-plant', title: 'כותרת הטיפ', body: 'משפט אחד.', next: 'צעד אחד.' });
    expect(html).toContain('data-kind="tip"');
    expect(html).toContain('<svg viewBox="0 0 200 80"');
    expect(html).toContain('כותרת הטיפ');
    expect(html).toContain('מה עכשיו?');
    expect(html).toContain('צעד אחד.');
    expect(html).toContain('זה עזר לך?');
  });

  it('leaves out "מה עכשיו?" when the tip has no next step', () => {
    expect(render({ id: 'y', art: 'tip-bulb', title: 'כותרת', body: 'משפט.' })).not.toContain('מה עכשיו?');
  });
});
