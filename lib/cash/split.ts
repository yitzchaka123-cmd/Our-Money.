import type { SplitPart } from '@/lib/cash/actions';

/**
 * RiseUp's "איך לפצל את ההוצאה?": you type the parts you are taking out,
 * and "מה שנשאר" is whatever is left of the original — filled in by itself,
 * never typed. The split saves only when every part has an amount and
 * something is left over, so the pieces always add up to the original.
 */

export interface SplitRow {
  /** As typed. */
  amountText: string;
  envelopeId: string | null;
  category: string;
}

export interface SplitCheck {
  remainder: number;
  ok: boolean;
  /** Why it cannot be saved yet; null when it can. */
  problem: string | null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function partAmount(text: string): number | null {
  const clean = text.replace(/[,\s₪]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Number(clean);
}

export function checkSplit(total: number, rows: SplitRow[]): SplitCheck {
  const amounts = rows.map((r) => partAmount(r.amountText));
  const typed = round(amounts.reduce<number>((s, a) => s + (a ?? 0), 0));
  const remainder = round(total - typed);
  if (rows.length === 0) return { remainder, ok: false, problem: 'צריך לפחות חלק אחד.' };
  if (amounts.some((a) => a === null || a <= 0)) return { remainder, ok: false, problem: 'צריך סכום לכל חלק.' };
  if (remainder <= 0) return { remainder, ok: false, problem: 'החלקים מגיעים לסכום המקורי או עוברים אותו — צריך שיישאר משהו.' };
  if (rows.some((r) => !r.category.trim())) return { remainder, ok: false, problem: 'צריך קטגוריה לכל חלק.' };
  return { remainder, ok: true, problem: null };
}

/**
 * The parts as the split action takes them: what is left first, so the
 * original row keeps it (with its own note), then each part typed.
 */
export function splitParts(
  total: number,
  rows: SplitRow[],
  rest: { envelopeId: string | null; category: string; note: string | null },
  partNote: string | null,
): SplitPart[] {
  const { remainder } = checkSplit(total, rows);
  return [
    { amountIls: remainder, category: rest.category, envelopeId: rest.envelopeId, note: rest.note },
    ...rows.map((r) => ({ amountIls: partAmount(r.amountText) ?? 0, category: r.category, envelopeId: r.envelopeId, note: partNote })),
  ];
}
