import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  cashLowInsight,
  computeInsights,
  keysToMarkSeen,
  trackerInsights,
  type InsightFeedback,
  type InsightInput,
} from '@/lib/dashboard/insights';
import { migrationProblems } from '@/scripts/lib/migration-guard';

/** Sunday 11 October 2026. */
const TODAY = '2026-10-11';

function input(extra: Partial<InsightInput> = {}): InsightInput {
  return {
    today: TODAY,
    month: '2026-10',
    envelopes: [],
    trackers: [{ name: 'פארמה', planned: 450, actual: 520 }],
    forecast: -10217,
    yesterdayForecast: -9400,
    wallet: { balance: 600, wallets: [{ name: 'ארנק ראשי', balance: 600 }] },
    baselineExpenses: [40, 60, 80, 90, 100, 120, 35, 55],
    ...extra,
  };
}

const OVER = 'tracker-over:2026-10:פארמה';
const FORECAST = 'forecast:2026-10-11';

/** 09:00 in Israel on the given day. */
const at = (day: string) => `${day}T06:00:00Z`;

function keys(feedback: InsightFeedback, extra: Partial<InsightInput> = {}): string[] {
  return computeInsights(input(extra), feedback).map((i) => i.key);
}

describe('an insight card is shown once (V2-17)', () => {
  it('shows a card nobody has seen yet, and marks it seen', () => {
    const shown = computeInsights(input(), new Map());
    expect(shown.map((i) => i.key)).toEqual([FORECAST, OVER]);
    expect(keysToMarkSeen(shown, new Map())).toEqual([FORECAST, OVER]);
  });

  it('keeps showing it for the rest of the day it was first shown', () => {
    const feedback: InsightFeedback = new Map([[OVER, { dismissed: false, helpful: null, seenAt: at(TODAY) }]]);
    expect(keys(feedback)).toContain(OVER);
    expect(keysToMarkSeen(computeInsights(input(), feedback), feedback)).toEqual([FORECAST]);
  });

  it('does not show it again on a later day', () => {
    const feedback: InsightFeedback = new Map([[OVER, { dismissed: false, helpful: null, seenAt: at('2026-10-10') }]]);
    expect(keys(feedback)).not.toContain(OVER);
  });

  it('judges "the same day" in Israel time', () => {
    // 22:30 UTC on the 10th is already 01:30 on the 11th in Israel.
    const feedback: InsightFeedback = new Map([[OVER, { dismissed: false, helpful: null, seenAt: '2026-10-10T22:30:00Z' }]]);
    expect(keys(feedback)).toContain(OVER);
  });

  it('never brings back a card that was opened, even the same day', () => {
    const feedback: InsightFeedback = new Map([[OVER, { dismissed: false, helpful: null, seenAt: at(TODAY), openedAt: at(TODAY) }]]);
    expect(keys(feedback)).not.toContain(OVER);
  });

  it('treats an answered "זה עזר לך?" as opened', () => {
    const feedback: InsightFeedback = new Map([[OVER, { dismissed: false, helpful: false }]]);
    expect(keys(feedback)).not.toContain(OVER);
  });

  it('never brings back a dismissed card', () => {
    const feedback: InsightFeedback = new Map([[OVER, { dismissed: true, helpful: null, seenAt: at(TODAY) }]]);
    expect(keys(feedback)).not.toContain(OVER);
  });

  it('shows a card again only under a new key, when its numbers move materially', () => {
    const feedback: InsightFeedback = new Map([[OVER, { dismissed: false, helpful: null, seenAt: at('2026-10-05') }]]);
    // 70 ₪ over → 95 ₪ over: the same card, already seen.
    expect(keys(feedback, { trackers: [{ name: 'פארמה', planned: 450, actual: 545 }] })).not.toContain(OVER);
    // 70 ₪ over → 400 ₪ over: a new card.
    const later = keys(feedback, { trackers: [{ name: 'פארמה', planned: 450, actual: 850 }] });
    expect(later.some((k) => k.startsWith(`${OVER}:`))).toBe(true);
  });
});

describe('keys that change only with a material change', () => {
  const over = (actual: number) => trackerInsights(input({ trackers: [{ name: 'פארמה', planned: 450, actual }] }))[0]!.key;

  it('keeps the first key of a tracker over its target as it was, so old dismissals hold', () => {
    expect(over(520)).toBe(OVER);
    expect(over(560)).toBe(OVER);
  });

  it('moves to a new key every quarter of the target further over (at least 100 ₪)', () => {
    expect(over(450 + 120)).toBe(`${OVER}:2`);
    expect(over(450 + 240)).toBe(`${OVER}:3`);
  });

  it('steps the cash-low card every 200 ₪ of shortfall', () => {
    const low = (balance: number) =>
      cashLowInsight(
        input({
          wallet: { balance, wallets: [{ name: 'ארנק ראשי', balance }] },
          envelopes: [
            {
              key: 'var', envelopeId: 'var', type: 'variable', title: 'הוצאות משתנות', actual: 0, expected: 0, actuals: [], showRemaining: false,
              pending: [{ planId: 'p', kind: 'spend', amountIls: 800, date: '2026-10-20', label: 'עוזרת', category: 'עוזרת', note: null, memberName: null, memberId: null, walletId: null, recurrence: 'monthly', envelopeId: 'var' }],
              pendingTotal: 800,
            },
          ],
        }),
      )!.key;
    expect(low(700)).toBe('cash-low:2026-10');
    expect(low(500)).toBe('cash-low:2026-10:2');
    expect(low(0)).toBe('cash-low:2026-10:5');
  });
});

describe('migration 0012', () => {
  const sql = readFileSync('supabase/migrations/0012_brief_setting_and_seen_cards.sql', 'utf8');

  it('adds when a card was first shown and when it was opened', () => {
    expect(sql).toMatch(/money\.insight_feedback\s+add column if not exists seen_at timestamptz/);
    expect(sql).toMatch(/add column if not exists opened_at timestamptz/);
  });

  it('stays inside money', () => {
    expect(migrationProblems(sql)).toEqual([]);
  });
});
