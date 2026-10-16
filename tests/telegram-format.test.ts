import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TelegramSettings } from '@/app/settings/TelegramSettings';
import { categoryKeyboard, decodeCallback, encodeCallback, savedMessage, spendKeyboard, walletTag } from '@/lib/telegram/format';
import type { CashSpend } from '@/lib/types';

const ID = '5f0c2b8e-1d2a-4c3b-9e4f-0a1b2c3d4e5f';

function spend(overrides: Partial<CashSpend> = {}): CashSpend {
  return {
    id: ID,
    member_id: 'm1',
    amount_ils: 45,
    category: 'סופר',
    note: 'שופרסל',
    spent_at: '2026-10-15',
    status: 'confirmed',
    confidence: 'high',
    input_kind: 'voice',
    raw_input: null,
    transcript: null,
    telegram_update_id: 1,
    telegram_chat_id: 111,
    telegram_message_id: 1,
    bot_message_id: 2,
    envelope_id: null,
    envelope_type: 'trackingCategory',
    wallet_id: null,
    created_at: '2026-10-15T10:00:00Z',
    ...overrides,
  };
}

describe('V4-4: the bot reply and its buttons', () => {
  it('a saved spend says who logged it, by name, with change and delete', () => {
    expect(savedMessage([spend()], '2026-10-15', 'יצחק')).toMatch(/^✅ נרשם · יצחק/);
    expect(spendKeyboard([spend()]).flat().map((b) => b.text)).toEqual(['✏️ שינוי קטגוריה', '🗑 מחיקה']);
  });

  it('a spend waiting for approval asks, with לאשר first', () => {
    const waiting = spend({ status: 'needs_review' });
    expect(savedMessage([waiting], '2026-10-15', 'יצחק')).toMatch(/^📝 לאשר את ההוצאה\? · יצחק/);
    expect(spendKeyboard([waiting]).flat().map((b) => b.text)).toEqual(['✅ לאשר', '✏️ שינוי קטגוריה', '🗑 מחיקה']);
  });

  it('the picker ends with חזרה, which round-trips through callback data', () => {
    const keyboard = categoryKeyboard(ID, ['אוכל בחוץ', 'סופר', 'הוצאות משתנות']);
    const last = keyboard.at(-1)!;
    expect(last.map((b) => b.text)).toEqual(['↩️ חזרה']);
    expect(decodeCallback(last[0]!.callback_data)).toEqual({ kind: 'back', spendId: ID });
    expect(decodeCallback(encodeCallback({ kind: 'set_category', spendId: ID, categoryIndex: 1 }))).toEqual({
      kind: 'set_category',
      spendId: ID,
      categoryIndex: 1,
    });
    for (const row of keyboard) for (const b of row) expect(new TextEncoder().encode(b.callback_data).length).toBeLessThanOrEqual(64);
  });

  it('Settings offers לרשום מיד / לשאול לפני שרושמים', () => {
    const html = renderToStaticMarkup(
      createElement(TelegramSettings, {
        data: { members: [{ id: 'm1', name: 'יצחק', isYou: true, nudge: 'daily', confirm: 'ask' }] },
      }),
    );
    expect(html).toContain('לרשום מיד');
    expect(html).toMatch(/aria-checked="true"[^>]*data-selected="true"[^>]*>לשאול לפני שרושמים/);
  });

  it('V2-6b: a wallet button carries the withdrawal, the wallet’s place and the start of its id, within 64 bytes', () => {
    const data = encodeCallback({ kind: 'assign_wallet', spendId: ID, walletIndex: 3, walletTag: walletTag('a1b2c3d4-0000-4000-8000-000000000000') });
    expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);
    expect(decodeCallback(data)).toEqual({ kind: 'assign_wallet', spendId: ID, walletIndex: 3, walletTag: 'a1b2c3' });
    expect(decodeCallback(`aw:${ID.replace(/-/g, '')}:1`)).toBeNull();
  });
});

describe('envelope picker guards its index with the name (check after V4-4)', () => {
  it('encodes and decodes a name tag, and the tag tells names apart', async () => {
    const { categoryKeyboard, decodeCallback, nameTag } = await import('@/lib/telegram/format');
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const rows = categoryKeyboard(id, ['סופר', 'אוכל בחוץ']);
    const data = rows[0]![0]!.callback_data!;
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
    expect(decodeCallback(data)).toMatchObject({ kind: 'set_category', categoryIndex: 0, tag: nameTag('סופר') });
    expect(nameTag('סופר')).not.toBe(nameTag('אוכל בחוץ'));
    // Old buttons without a tag still decode.
    expect(decodeCallback(data.split(':').slice(0, 3).join(':'))).toMatchObject({ kind: 'set_category', categoryIndex: 0 });
  });
});
