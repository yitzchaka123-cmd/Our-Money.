import { describe, expect, it } from 'vitest';

import { checkSplit, splitParts, type SplitRow } from '@/lib/cash/split';

const row = (amountText: string, category = 'סופר', envelopeId: string | null = null): SplitRow => ({ amountText, category, envelopeId });

describe('split', () => {
  it('fills in what is left by itself', () => {
    expect(checkSplit(60, [row('25')])).toEqual({ remainder: 35, ok: true, problem: null });
    expect(checkSplit(100, [row('20.5'), row('30')]).remainder).toBe(49.5);
  });

  it('will not save until every part has an amount and something is left', () => {
    expect(checkSplit(60, [row('')])).toMatchObject({ ok: false, problem: 'צריך סכום לכל חלק.' });
    expect(checkSplit(60, [row('0')]).ok).toBe(false);
    expect(checkSplit(60, [row('60')]).ok).toBe(false);
    expect(checkSplit(60, [row('70')])).toMatchObject({ remainder: -10, ok: false });
    expect(checkSplit(60, [row('20', ' ')]).ok).toBe(false);
    expect(checkSplit(60, [])).toMatchObject({ ok: false });
  });

  it('sends what is left first, so the original row keeps it, and the parts add up', () => {
    const parts = splitParts(60, [row('25', 'פארמה', 'custom:פארמה')], { envelopeId: 'var', category: 'סופר', note: 'מכולת' }, 'מכולת');
    expect(parts).toEqual([
      { amountIls: 35, category: 'סופר', envelopeId: 'var', note: 'מכולת' },
      { amountIls: 25, category: 'פארמה', envelopeId: 'custom:פארמה', note: 'מכולת' },
    ]);
    expect(parts.reduce((s, p) => s + p.amountIls, 0)).toBe(60);
  });
});
