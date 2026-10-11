/**
 * Paging for "חיפוש בתזרים": results come from three tables — RiseUp's
 * charges, our cash spends, our cash top-ups — each read newest first. A
 * page takes the newest rows across all three, and the cursor remembers how
 * far into each table it has read, so "טען תוצאות ישנות יותר" continues
 * exactly where the last page stopped: nothing repeated, nothing skipped.
 */

export const SEARCH_PAGE = 30;

export interface SearchCursor {
  card: number;
  spend: number;
  topup: number;
}

export type SearchSource = keyof SearchCursor;

const SOURCES: SearchSource[] = ['card', 'spend', 'topup'];

export const FIRST_PAGE: SearchCursor = { card: 0, spend: 0, topup: 0 };

/**
 * Merge per-table lists (each already newest first, each fetched with one
 * row more than a page) into one page. Always takes the head of a list, so
 * what is consumed from each table is a prefix and the offsets stay exact.
 */
export function mergePage<T extends { date: string }>(
  lists: Record<SearchSource, T[]>,
  cursor: SearchCursor,
  pageSize = SEARCH_PAGE,
): { items: T[]; next: SearchCursor | null } {
  const taken: SearchCursor = { card: 0, spend: 0, topup: 0 };
  const items: T[] = [];
  while (items.length < pageSize) {
    let best: SearchSource | null = null;
    for (const source of SOURCES) {
      const head = lists[source][taken[source]];
      if (!head) continue;
      if (best === null || head.date > lists[best][taken[best]]!.date) best = source;
    }
    if (best === null) break;
    items.push(lists[best][taken[best]]!);
    taken[best] += 1;
  }
  const more = SOURCES.some((s) => lists[s].length > taken[s]);
  return {
    items,
    next: more
      ? { card: cursor.card + taken.card, spend: cursor.spend + taken.spend, topup: cursor.topup + taken.topup }
      : null,
  };
}

/** Strip what PostgREST's filter grammar treats as syntax. */
export function cleanQuery(query: string): string {
  return query.replace(/[,()%*\\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** "60", "60.5", "1,200" or "₪60" read as an amount too. */
export function amountOf(query: string): number | null {
  const clean = query.replace(/[₪,\s]/g, '');
  return /^\d+(\.\d{1,2})?$/.test(clean) ? Number(clean) : null;
}

export function validCursor(cursor: unknown): cursor is SearchCursor {
  if (!cursor || typeof cursor !== 'object') return false;
  return SOURCES.every((s) => {
    const v = (cursor as Record<string, unknown>)[s];
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 100_000;
  });
}
