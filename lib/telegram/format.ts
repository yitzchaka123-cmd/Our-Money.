import { formatIls, friendlyDate } from '@/lib/money';
import { escapeHtml } from '@/lib/telegram/client';
import type { InlineKeyboard } from '@/lib/telegram/types';
import type { CashSpend } from '@/lib/types';

export { formatDate, formatIls, friendlyDate } from '@/lib/money';

/**
 * Telegram caps callback_data at 64 bytes, so ids travel dash-free (32 chars)
 * and categories travel as an index into the active list rather than as text —
 * Hebrew labels are multi-byte and would blow the budget on their own.
 */
export type CallbackAction =
  | { kind: 'delete'; spendId: string }
  | { kind: 'pick_category'; spendId: string }
  | { kind: 'set_category'; spendId: string; categoryIndex: number }
  | { kind: 'confirm'; spendId: string }
  /** "חזרה" from the envelope picker: put the original message back. */
  | { kind: 'back'; spendId: string }
  /** Delete a cash income (a cash_topups row); spendId carries the top-up id. */
  | { kind: 'delete_income'; spendId: string }
  /** "Not a withdrawal": dismiss a detected withdrawal top-up. */
  | { kind: 'dismiss_topup'; spendId: string }
  /**
   * "Which wallet did this withdrawal go into?": spendId carries the top-up
   * id; the wallet travels as its place in the list plus the start of its id,
   * so a list that changed in between is noticed rather than misfiled.
   */
  | { kind: 'assign_wallet'; spendId: string; walletIndex: number; walletTag: string }
  /** For these two, spendId carries the plan id and month the occurrence. */
  | { kind: 'settle_plan'; spendId: string; month: string }
  | { kind: 'skip_plan'; spendId: string; month: string };

const PREFIX = {
  delete: 'del',
  pick_category: 'cat',
  set_category: 'sc',
  confirm: 'ok',
  back: 'bk',
  delete_income: 'di',
  dismiss_topup: 'dt',
  assign_wallet: 'aw',
  settle_plan: 'sp',
  skip_plan: 'kp',
} as const;

export function packUuid(uuid: string): string {
  return uuid.replace(/-/g, '');
}

export function unpackUuid(packed: string): string {
  if (!/^[0-9a-f]{32}$/i.test(packed)) {
    throw new Error(`Malformed packed uuid: ${packed}`);
  }
  return [
    packed.slice(0, 8),
    packed.slice(8, 12),
    packed.slice(12, 16),
    packed.slice(16, 20),
    packed.slice(20),
  ].join('-');
}

export function encodeCallback(action: CallbackAction): string {
  const id = packUuid(action.spendId);
  switch (action.kind) {
    case 'delete':
      return `${PREFIX.delete}:${id}`;
    case 'pick_category':
      return `${PREFIX.pick_category}:${id}`;
    case 'confirm':
      return `${PREFIX.confirm}:${id}`;
    case 'back':
      return `${PREFIX.back}:${id}`;
    case 'delete_income':
      return `${PREFIX.delete_income}:${id}`;
    case 'dismiss_topup':
      return `${PREFIX.dismiss_topup}:${id}`;
    case 'assign_wallet':
      return `${PREFIX.assign_wallet}:${id}:${action.walletIndex}:${action.walletTag}`;
    case 'set_category':
      return `${PREFIX.set_category}:${id}:${action.categoryIndex}`;
    case 'settle_plan':
      return `${PREFIX.settle_plan}:${id}:${action.month.replace('-', '')}`;
    case 'skip_plan':
      return `${PREFIX.skip_plan}:${id}:${action.month.replace('-', '')}`;
  }
}

export function decodeCallback(data: string): CallbackAction | null {
  const parts = data.split(':');
  const [prefix, packed, extra, more] = parts;
  if (!prefix || !packed) return null;

  let spendId: string;
  try {
    spendId = unpackUuid(packed);
  } catch {
    return null;
  }

  switch (prefix) {
    case PREFIX.delete:
      return { kind: 'delete', spendId };
    case PREFIX.pick_category:
      return { kind: 'pick_category', spendId };
    case PREFIX.confirm:
      return { kind: 'confirm', spendId };
    case PREFIX.back:
      return { kind: 'back', spendId };
    case PREFIX.delete_income:
      return { kind: 'delete_income', spendId };
    case PREFIX.dismiss_topup:
      return { kind: 'dismiss_topup', spendId };
    case PREFIX.assign_wallet: {
      const walletIndex = Number(extra);
      if (!Number.isInteger(walletIndex) || walletIndex < 0 || !more || !/^[0-9a-f]{1,8}$/i.test(more)) return null;
      return { kind: 'assign_wallet', spendId, walletIndex, walletTag: more };
    }
    case PREFIX.settle_plan:
    case PREFIX.skip_plan: {
      if (!extra || !/^\d{6}$/.test(extra)) return null;
      const month = `${extra.slice(0, 4)}-${extra.slice(4)}`;
      return prefix === PREFIX.settle_plan
        ? { kind: 'settle_plan', spendId, month }
        : { kind: 'skip_plan', spendId, month };
    }
    case PREFIX.set_category: {
      const index = Number(extra);
      if (!Number.isInteger(index) || index < 0) return null;
      return { kind: 'set_category', spendId, categoryIndex: index };
    }
    default:
      return null;
  }
}

export function spendLine(spend: CashSpend, today: string): string {
  const note = spend.note ? ` — ${escapeHtml(spend.note)}` : '';
  return `<b>${formatIls(spend.amount_ils)}</b> · ${escapeHtml(spend.category)}${note} · ${friendlyDate(spend.spent_at, today)}`;
}

/**
 * The bot's reply to a logged spend, always built from the rows as they are
 * now — so "חזרה" from the picker, a new envelope or "לאשר" all redraw the
 * same message. Rows waiting for "לאשר" (the ask-first setting, or an amount
 * the AI was unsure of) say so.
 */
export function savedMessage(spends: CashSpend[], today: string, memberName: string): string {
  const waiting = spends.filter((s) => s.status === 'needs_review');
  const allWaiting = spends.length > 0 && waiting.length === spends.length;
  const unsure = waiting.some((s) => s.confidence === 'low');

  const header = allWaiting
    ? spends.length === 1
      ? '📝 לאשר את ההוצאה?'
      : `📝 לאשר ${spends.length} הוצאות?`
    : spends.length === 1
      ? '✅ נרשם'
      : `✅ נרשמו ${spends.length} הוצאות`;
  const lines = spends.map((spend) => `• ${spendLine(spend, today)}`);

  const footer = unsure
    ? '\n⚠️ לא הייתי בטוח בסכום או במעטפה — כדאי לבדוק ולאשר.'
    : allWaiting
      ? '\nעד שתאשרו, זה ממתין לאישור.'
      : waiting.length > 0
        ? '\nחלק מהרישומים ממתינים לאישור.'
        : '';

  return [`${header} · ${escapeHtml(memberName)}`, '', ...lines, footer].filter(Boolean).join('\n');
}

export function spendKeyboard(spends: CashSpend[]): InlineKeyboard {
  // With several entries in one message, per-entry buttons would be a wall of
  // text; the first entry is the one people fix, and /undo covers the rest.
  const primary = spends[0];
  if (!primary) return [];

  const rows: InlineKeyboard = [];
  if (spends.some((s) => s.status === 'needs_review')) {
    rows.push([
      { text: '✅ לאשר', callback_data: encodeCallback({ kind: 'confirm', spendId: primary.id }) },
    ]);
  }
  rows.push([
    {
      text: '✏️ שינוי קטגוריה',
      callback_data: encodeCallback({ kind: 'pick_category', spendId: primary.id }),
    },
    { text: '🗑 מחיקה', callback_data: encodeCallback({ kind: 'delete', spendId: primary.id }) },
  ]);
  return rows;
}

/**
 * The envelope picker: the household's envelopes for the spend's month (two
 * per row), and "חזרה" to put the original message back untouched.
 */
export function categoryKeyboard(spendId: string, categories: string[]): InlineKeyboard {
  const rows: InlineKeyboard = [];
  for (let i = 0; i < categories.length; i += 2) {
    const row = categories.slice(i, i + 2).map((label, offset) => ({
      text: label,
      callback_data: encodeCallback({
        kind: 'set_category',
        spendId,
        categoryIndex: i + offset,
      }),
    }));
    rows.push(row);
  }
  rows.push([{ text: '↩️ חזרה', callback_data: encodeCallback({ kind: 'back', spendId }) }]);
  return rows;
}

/** The start of a wallet id, enough to tell wallets apart inside callback data. */
export function walletTag(walletId: string): string {
  return walletId.replace(/-/g, '').slice(0, 6);
}
