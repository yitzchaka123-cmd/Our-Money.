/**
 * Our own notes on RiseUp charges (feedback video 2, item 16) — the parts
 * shared by the loaders, the search and the sheet. Saving is in
 * note-actions.ts.
 */

/** Longest note we keep; the sheet's field stops there too. */
export const NOTE_MAX = 300;

export interface NoteRow {
  transaction_id: string;
  note: string;
}

/** transaction id → note. A failed read (no migration 0011 yet) is no notes. */
export function noteMap(rows: NoteRow[] | null | undefined): Map<string, string> {
  return new Map((rows ?? []).map((r) => [r.transaction_id, r.note]));
}

/**
 * A PostgREST `in.(…)` list of transaction ids, each quoted so commas or
 * brackets in an id cannot change the filter.
 */
export function quotedIdList(ids: string[]): string {
  return `(${ids.map((id) => `"${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;
}
