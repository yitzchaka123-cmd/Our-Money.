import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnvelopeRef } from '@/lib/cash/envelopes';
import type { TrackerOverride } from '@/lib/dashboard/trackers';
import {
  botEnvelopes,
  envelopeOfSpend,
  fileExpense,
  FIXED_NAME,
  sameEnvelopeIn,
  VARIABLE_NAME,
} from '@/lib/intake/envelopes';

const M = '2026-10';
const id = (key: string, part = 0) => `${M}#trackingCategory#${key}#${part}`;
const SUPER = 'v2-default-il-expense-category-2';
const OUT = 'v2-default-il-expense-category-9';
const LEISURE = 'v2-default-il-expense-category-3';

// The month as stored: RiseUp's automatic names ("כלכלה" for the supermarket
// tracker, split into weekly parts), plus the big envelopes.
const refs: EnvelopeRef[] = [
  { envelopeId: `${M}#variable`, type: 'variable', name: 'הוצאות משתנות', categoryLabels: ['מזון וצריכה', 'פנאי ובידור'] },
  { envelopeId: `${M}#fixed#a`, type: 'fixed', name: 'הוצאות קבועות', categoryLabels: ['ביטוח'] },
  { envelopeId: `${M}#fixed#b`, type: 'fixed', name: 'הוצאות קבועות', categoryLabels: ['תקשורת'] },
  { envelopeId: id(SUPER, 0), type: 'trackingCategory', name: 'כלכלה', categoryLabels: ['מזון וצריכה'] },
  { envelopeId: id(SUPER, 1), type: 'trackingCategory', name: 'כלכלה', categoryLabels: ['מזון וצריכה'] },
  { envelopeId: id(OUT), type: 'trackingCategory', name: 'אוכל בחוץ' },
  { envelopeId: id(LEISURE), type: 'trackingCategory', name: 'פנאי' },
  { envelopeId: `${M}#variableIncome`, type: 'variableIncome', name: 'הכנסות' },
];

// The couple renamed the supermarket tracker "סופר" and stopped following "פנאי".
const overrides: TrackerOverride[] = [
  { trackerKey: SUPER, month: '', name: 'סופר', targetIls: null, hidden: false, categoryLabel: null },
  { trackerKey: LEISURE, month: '', name: null, targetIls: null, hidden: true, categoryLabel: null },
];

const envelopes = botEnvelopes(refs, overrides, M);

describe('V3-2 / V2-10: the bot files into the household’s own envelopes', () => {
  it('offers each tracker once by its real name, then variable and fixed — nothing else', () => {
    expect(envelopes.map((e) => e.name)).toEqual(['אוכל בחוץ', 'סופר', VARIABLE_NAME, FIXED_NAME]);
    const names = envelopes.map((e) => e.name).join('|');
    for (const raw of ['RiseUp', 'מזון וצריכה', 'פנאי ובידור', 'כלכלה', 'אחר', 'הכנסות']) expect(names).not.toContain(raw);
  });

  it('pins each envelope to this month’s id', () => {
    expect(envelopes.find((e) => e.name === 'סופר')).toMatchObject({ envelopeId: id(SUPER, 0), key: SUPER, type: 'trackingCategory' });
    expect(envelopes.find((e) => e.name === VARIABLE_NAME)?.envelopeId).toBe(`${M}#variable`);
    expect(envelopes.find((e) => e.name === FIXED_NAME)?.envelopeId).toBe(`${M}#fixed#a`);
  });

  it('works before the first sync: just the two big envelopes, unpinned', () => {
    expect(botEnvelopes([], [], M).map((e) => [e.name, e.envelopeId])).toEqual([
      [VARIABLE_NAME, null],
      [FIXED_NAME, null],
    ]);
  });

  it('sends supermarket words to the supermarket tracker even when the AI said catch-all or "אחר"', () => {
    for (const words of ['80 בסופר', 'שופרסל דיל', 'רמי לוי', 'מכולת ליד הבית', 'groceries at the supermarket']) {
      expect(fileExpense('אחר', words, envelopes).name).toBe('סופר');
      expect(fileExpense(VARIABLE_NAME, words, envelopes).name).toBe('סופר');
    }
    // Super-Pharm is not a supermarket.
    expect(fileExpense(VARIABLE_NAME, 'סופר-פארם', envelopes).name).toBe(VARIABLE_NAME);
  });

  it('sends restaurant words to "אוכל בחוץ"', () => {
    expect(fileExpense('מסעדות', 'פלאפל ליד העבודה', envelopes).name).toBe('אוכל בחוץ');
    expect(fileExpense('אחר', 'coffee', envelopes).name).toBe('אוכל בחוץ');
  });

  it('files the unknown into variable — never a made-up category', () => {
    expect(fileExpense('אחר', 'מתנה ליום הולדת', envelopes).name).toBe(VARIABLE_NAME);
    expect(fileExpense('מזון וצריכה', '', envelopes).name).toBe(VARIABLE_NAME);
    expect(fileExpense('פנאי', 'סרט', envelopes).name).toBe(VARIABLE_NAME); // not followed any more
  });

  it('keeps a real envelope the AI chose', () => {
    expect(fileExpense(FIXED_NAME, 'ועד בית', envelopes).name).toBe(FIXED_NAME);
    expect(fileExpense('סופר', 'חלב', envelopes).name).toBe('סופר');
  });

  it('finds the same tracker in another month by its key', () => {
    const september = botEnvelopes(
      [
        { envelopeId: '2026-09#variable', type: 'variable', name: 'הוצאות משתנות' },
        { envelopeId: `2026-09#trackingCategory#${SUPER}#0`, type: 'trackingCategory', name: 'כלכלה' },
      ],
      overrides,
      '2026-09',
    );
    const target = sameEnvelopeIn(envelopes.find((e) => e.name === 'סופר')!, september);
    expect(target.envelopeId).toBe(`2026-09#trackingCategory#${SUPER}#0`);
  });

  it('names a stored spend by the envelope it sits in (for /month)', () => {
    expect(envelopeOfSpend({ envelope_id: id(SUPER, 1), envelope_type: 'trackingCategory', category: 'מזון וצריכה' }, envelopes).name).toBe('סופר');
    expect(envelopeOfSpend({ envelope_id: `${M}#variable`, envelope_type: 'variable', category: 'אחר' }, envelopes).name).toBe(VARIABLE_NAME);
    expect(envelopeOfSpend({ envelope_id: `${M}#fixed#b`, envelope_type: 'fixed', category: 'ביטוח' }, envelopes).name).toBe(FIXED_NAME);
    expect(envelopeOfSpend({ envelope_id: id(LEISURE), envelope_type: 'trackingCategory', category: 'פנאי' }, envelopes).name).toBe(VARIABLE_NAME);
    expect(envelopeOfSpend({ envelope_id: null, envelope_type: null, category: 'סופר' }, envelopes).name).toBe('סופר');
  });
});

// --- parseIntake with the AI client mocked ----------------------------------

const ai = vi.hoisted(() => ({
  calls: [] as Array<{ model: string; system: Array<{ text: string }>; messages: unknown }>,
  output: null as unknown,
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      parse: async (request: { model: string; system: Array<{ text: string }>; messages: unknown }) => {
        ai.calls.push(request);
        return { parsed_output: ai.output };
      },
    };
  },
}));

describe('parseIntake (AI mocked)', () => {
  beforeEach(() => {
    ai.calls = [];
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.AI_MODEL = 'model-from-the-environment';
  });

  const entry = (category: string, note: string) => ({
    amount_ils: 45,
    direction: 'expense' as const,
    category,
    note,
    spent_at: '2026-10-15',
    confidence: 'high' as const,
    wallet: null,
  });

  it('asks the model from AI_MODEL, with the envelopes and what goes in each', async () => {
    const { parseIntake } = await import('@/lib/intake/parse');
    ai.output = { intent: 'log_expense', entries: [entry('סופר', 'שופרסל')], reply_note: null };
    await parseIntake('45 בשופרסל', { today: '2026-10-15', envelopes });

    const call = ai.calls[0]!;
    expect(call.model).toBe('model-from-the-environment');
    const prompt = call.system[0]!.text;
    expect(prompt).toContain('- סופר: groceries');
    expect(prompt).toContain('- אוכל בחוץ: eating or drinking out');
    expect(prompt).toContain(`- ${VARIABLE_NAME}`);
    expect(prompt).toContain('never use "אחר"');
    expect(prompt).not.toMatch(/מזון וצריכה|פנאי ובידור|Catch-all category: אחר/);
  });

  it('files a supermarket spend into "סופר" even if the model answered "אחר"', async () => {
    const { parseIntake } = await import('@/lib/intake/parse');
    ai.output = { intent: 'log_expense', entries: [entry('אחר', 'קניות')], reply_note: null };
    const result = await parseIntake('45 שקל בסופר', { today: '2026-10-15', envelopes });
    expect(result.entries[0]!.category).toBe('סופר');
  });

  it('turns an unknown label into "הוצאות משתנות"', async () => {
    const { parseIntake } = await import('@/lib/intake/parse');
    ai.output = { intent: 'log_expense', entries: [entry('מתנות ותרומות', 'מתנה לחבר')], reply_note: null };
    const result = await parseIntake('45 מתנה לחבר', { today: '2026-10-15', envelopes });
    expect(result.entries[0]!.category).toBe(VARIABLE_NAME);
  });

  it('judges each of several entries by its own note', async () => {
    const { parseIntake } = await import('@/lib/intake/parse');
    ai.output = {
      intent: 'log_expense',
      entries: [entry(VARIABLE_NAME, 'סופר'), entry(VARIABLE_NAME, 'מונית')],
      reply_note: null,
    };
    const result = await parseIntake('80 בסופר ו-30 מונית', { today: '2026-10-15', envelopes });
    expect(result.entries.map((e) => e.category)).toEqual(['סופר', VARIABLE_NAME]);
  });
});
