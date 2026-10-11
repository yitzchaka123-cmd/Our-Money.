import { describe, expect, it } from 'vitest';

import { barRatio } from '@/lib/dashboard/bar';

describe('barRatio', () => {
  it('draws an empty bar when nothing is planned and nothing has gone out', () => {
    expect(barRatio(0, 0)).toBe(0);
  });

  it('keeps the full, over-budget bar when money went out with nothing planned', () => {
    expect(barRatio(120, 0)).toBe(1);
  });

  it('fills in proportion to the plan', () => {
    expect(barRatio(25, 100)).toBe(0.25);
  });

  it('never overflows past a full bar', () => {
    expect(barRatio(300, 100)).toBe(1);
  });

  it('treats a negative or missing figure as nothing', () => {
    expect(barRatio(-5, 0)).toBe(0);
    expect(barRatio(Number.NaN, 100)).toBe(0);
  });
});
