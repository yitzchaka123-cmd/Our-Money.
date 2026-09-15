import { escapeHtml } from '@/lib/telegram/client';
import type { InlineKeyboard } from '@/lib/telegram/types';
import type { CashSpend } from '@/lib/types';

/**
 * Telegram caps callback_data at 64 bytes, so ids travel dash-free (32 chars)
 * and categories travel as an index into the active list rather than as text —
 * Hebrew labels are multi-byte and would blow the budget on their own.
 */
export type CallbackAction =
  | { kind: 'delete'; spendId: string }
  | { kind: 'pick_category'; spendId: string }
  | { kind: 'set_category'; spendId: string; categoryIndex: number }
  | { kind: 'confirm'; spendId: string };

const PREFIX = {
  delete: 'del',
  pick_category: 'cat',
  set_category: 'sc',
  confirm: 'ok',
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
    case 'set_category':
      return `${PREFIX.set_category}:${id}:${action.categoryIndex}`;
  }
}

export function decodeCallback(data: string): CallbackAction | null {
  const parts = data.split(':');
  const [prefix, packed, extra] = parts;
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
    case PREFIX.set_category: {
      const index = Number(extra);
      if (!Number.isInteger(index) || index < 0) return null;
      return { kind: 'set_category', spendId, categoryIndex: index };
    }
    default:
      return null;
  }
}

export function formatIls(amount: number): string {
  return `₪${amount.toLocaleString('he-IL', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

/** Relative day label, so "היום" reads naturally instead of a bare date. */
export function friendlyDate(iso: string, today: string): string {
  if (iso === today) return 'היום';

  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`);
  if (diff === dayMs) return 'אתמול';
  if (diff === 2 * dayMs) return 'שלשום';
  return formatDate(iso);
}

export function spendLine(spend: CashSpend, today: string): string {
  const note = spend.note ? ` — ${escapeHtml(spend.note)}` : '';
  return `<b>${formatIls(spend.amount_ils)}</b> · ${escapeHtml(spend.category)}${note} · ${friendlyDate(spend.spent_at, today)}`;
}

export function savedMessage(spends: CashSpend[], today: string, memberName: string): string {
  const header =
    spends.length === 1 ? '✅ נרשם' : `✅ נרשמו ${spends.length} הוצאות`;
  const lines = spends.map((spend) => `• ${spendLine(spend, today)}`);
  const needsReview = spends.some((s) => s.status === 'needs_review');

  return [
    `${header} · ${escapeHtml(memberName)}`,
    '',
    ...lines,
    needsReview ? '\n⚠️ לא הייתי בטוח בסכום או בקטגוריה — כדאי לאשר.' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function spendKeyboard(spends: CashSpend[]): InlineKeyboard {
  // With several entries in one message, per-entry buttons would be a wall of
  // text; the first entry is the one people fix, and /undo covers the rest.
  const primary = spends[0];
  if (!primary) return [];

  const rows: InlineKeyboard = [];
  if (primary.status === 'needs_review') {
    rows.push([
      { text: '✅ אישור', callback_data: encodeCallback({ kind: 'confirm', spendId: primary.id }) },
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
  return rows;
}
