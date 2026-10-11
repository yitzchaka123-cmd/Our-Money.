import { describe, expect, it } from 'vitest';

import { amountOf, cleanQuery, FIRST_PAGE, mergePage, validCursor } from '@/lib/dashboard/search';

const row = (date: string, id: string) => ({ date, id });

describe('search paging', () => {
  it('takes the newest rows across the three tables and remembers how far it read in each', () => {
    const lists = {
      card: [row('2026-10-09', 'c1'), row('2026-10-05', 'c2'), row('2026-09-30', 'c3')],
      spend: [row('2026-10-07', 's1'), row('2026-10-01', 's2')],
      topup: [row('2026-10-08', 't1')],
    };
    const page = mergePage(lists, FIRST_PAGE, 4);
    expect(page.items.map((r) => r.id)).toEqual(['c1', 't1', 's1', 'c2']);
    expect(page.next).toEqual({ card: 2, spend: 1, topup: 1 });
  });

  it('continues from an earlier cursor and stops when everything was read', () => {
    const page = mergePage({ card: [row('2026-09-30', 'c3')], spend: [row('2026-10-01', 's2')], topup: [] }, { card: 2, spend: 1, topup: 1 }, 4);
    expect(page.items.map((r) => r.id)).toEqual(['s2', 'c3']);
    expect(page.next).toBeNull();
  });

  it('says there is more when a table returned a row beyond the page', () => {
    const lists = { card: [row('2026-10-03', 'a'), row('2026-10-02', 'b'), row('2026-10-01', 'c')], spend: [], topup: [] };
    expect(mergePage(lists, FIRST_PAGE, 2).next).toEqual({ card: 2, spend: 0, topup: 0 });
  });

  it('reads queries safely', () => {
    expect(cleanQuery(' a,b.eq.1) "x" ')).toBe('a b.eq.1 x');
    expect(amountOf('60')).toBe(60);
    expect(amountOf('1,200.5')).toBe(1200.5);
    expect(amountOf('₪60')).toBe(60);
    expect(amountOf('באג')).toBeNull();
    expect(validCursor({ card: 1, spend: 0, topup: 3 })).toBe(true);
    expect(validCursor({ card: -1, spend: 0, topup: 3 })).toBe(false);
    expect(validCursor(null)).toBe(false);
  });
});
