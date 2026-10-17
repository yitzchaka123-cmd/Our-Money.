import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TelegramMessage, TelegramUpdate } from '@/lib/telegram/types';

import { resetDb, seedMember, seedMonth, sql } from './helpers';

/**
 * C25: a photo of a receipt goes through exactly the same flow as a typed or
 * spoken spend — against the real database, with Telegram and the AI replaced.
 */

const telegram = vi.hoisted(() => ({
  sent: [] as Array<{ chatId: number; text: string; keyboard?: Array<Array<{ text: string; callback_data: string }>> }>,
  downloads: [] as Array<{ fileId: string; maxBytes?: number }>,
  failDownload: false,
}));
vi.mock('@/lib/telegram/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/telegram/client')>();
  return {
    ...original,
    sendMessage: async (chatId: number, text: string, keyboard?: Array<Array<{ text: string; callback_data: string }>>) => {
      telegram.sent.push({ chatId, text, keyboard });
      return { message_id: 1000 + telegram.sent.length, chat: { id: chatId, type: 'private' }, date: 0 };
    },
    editMessageText: async () => {},
    answerCallbackQuery: async () => {},
    sendTyping: async () => {},
    getMe: async () => ({ id: 999000, username: 'our_money_test_bot', first_name: 'Our Money' }),
    leaveChat: async () => {},
    downloadFile: async (fileId: string, options?: { maxBytes?: number }) => {
      telegram.downloads.push({ fileId, maxBytes: options?.maxBytes });
      if (telegram.failDownload) throw new Error('network down');
      return new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;
    },
  };
});

const ai = vi.hoisted(() => ({
  calls: [] as Array<{ model: string; messages: Array<{ content: Array<Record<string, unknown>> }> }>,
  output: null as unknown,
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      parse: async (request: (typeof ai.calls)[number]) => {
        ai.calls.push(request);
        return { parsed_output: ai.output };
      },
    };
  },
}));

const MONTH = '2026-09';
const SUPER_ID = `${MONTH}#trackingCategory#v2-default-il-expense-category-2#0`;
const GROUP = -100777;
let updateId = 9000;

function run(statement: string): void {
  execFileSync(
    join(process.env.TEST_PG_BIN!, 'psql'),
    ['-h', '127.0.0.1', '-p', process.env.TEST_PG_PORT!, '-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-c', statement],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PGOPTIONS: '-c search_path=money' } },
  );
}

function photoUpdate(
  over: Partial<TelegramMessage> = {},
  from = 111,
  chat: { id: number; type: 'private' | 'group' } = { id: from, type: 'private' },
): TelegramUpdate {
  updateId += 1;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 0,
      chat,
      from: { id: from, is_bot: false, first_name: 'Nechemiah' },
      photo: [
        { file_id: 'thumb-id', file_unique_id: 't', width: 90, height: 120, file_size: 1500 },
        { file_id: 'receipt-file-id', file_unique_id: 'r', width: 960, height: 1280, file_size: 150000 },
      ],
      ...over,
    },
  } as TelegramUpdate;
}

function receipt(over: Record<string, unknown> = {}) {
  return {
    is_receipt: true,
    total_ils: 182.4,
    business_name: 'שופרסל דיל',
    date: `${MONTH}-16`,
    category: 'סופר',
    note: 'שופרסל דיל',
    paid_by_card: false,
    confidence: 'high',
    wallet: null,
    reply_note: null,
    ...over,
  };
}

const buttonTexts = (keyboard?: Array<Array<{ text: string }>>) => (keyboard ?? []).flat().map((b) => b.text);

let member: string;

beforeEach(async () => {
  resetDb();
  run('truncate tracker_overrides, app_settings');
  member = await seedMember(111, 'Nechemiah Seltzer');
  await seedMonth(MONTH);
  run(`insert into riseup_envelopes (month, envelope_id, envelope_type, name, planned_ils, actual_ils, position)
       values ('${MONTH}', '${SUPER_ID}', 'trackingCategory', 'כלכלה', 3000, 0, 5)`);
  run(`insert into tracker_overrides (tracker_key, month, name) values ('v2-default-il-expense-category-2', '', 'סופר')`);
  const { resetCategoryCache } = await import('@/lib/intake/categories');
  resetCategoryCache();
  telegram.sent = [];
  telegram.downloads = [];
  telegram.failDownload = false;
  ai.calls = [];
  ai.output = null;
});

describe('C25: a photo of a receipt', () => {
  it('reads the largest size, saves the spend in its envelope and replies with the usual buttons', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    ai.output = receipt();
    await handleUpdate(photoUpdate());

    expect(telegram.downloads.map((d) => d.fileId)).toEqual(['receipt-file-id']);
    expect(ai.calls[0]!.model).toBe('integration-model');
    expect(ai.calls[0]!.messages[0]!.content.some((b) => b.type === 'image')).toBe(true);

    expect(sql('select amount_ils, category, envelope_id, status, input_kind, note, raw_input, transcript from cash_spends')).toEqual([
      {
        amount_ils: 182.4,
        category: 'סופר',
        envelope_id: SUPER_ID,
        status: 'confirmed',
        input_kind: 'text',
        note: 'שופרסל דיל',
        raw_input: '[קבלה] שופרסל דיל · file:receipt-file-id',
        transcript: null,
      },
    ]);
    const reply = telegram.sent[0]!;
    expect(reply.text).toContain('✅ נרשם');
    expect(reply.text).toContain('₪182.4');
    expect(buttonTexts(reply.keyboard)).toEqual(['✏️ שינוי קטגוריה', '🗑 מחיקה']);
  });

  it('in "לשאול לפני שרושמים" mode it waits for לאשר, like a typed spend', async () => {
    run(`update household_members set bot_confirm_mode = 'ask' where id = '${member}'`);
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    ai.output = receipt();
    await handleUpdate(photoUpdate());
    expect(sql('select status from cash_spends')).toEqual([{ status: 'needs_review' }]);
    expect(buttonTexts(telegram.sent[0]!.keyboard)).toEqual(['✅ לאשר', '✏️ שינוי קטגוריה', '🗑 מחיקה']);
  });

  it('a shaky reading always asks first, even in "לרשום מיד" mode', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    ai.output = receipt({ confidence: 'low' });
    await handleUpdate(photoUpdate());
    expect(sql('select status from cash_spends')).toEqual([{ status: 'needs_review' }]);
    expect(telegram.sent[0]!.text).toContain('לאשר');
  });

  it('accepts an image sent as a file, and passes the caption along', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    ai.output = receipt({ note: 'שופרסל — קניות לשבת' });
    await handleUpdate(
      photoUpdate({
        photo: undefined,
        document: { file_id: 'doc-id', file_unique_id: 'd', mime_type: 'image/png', file_size: 2_000_000 },
        caption: 'מזומן, קניות לשבת',
      }),
    );
    expect(telegram.downloads[0]!.fileId).toBe('doc-id');
    const image = ai.calls[0]!.messages[0]!.content.find((b) => b.type === 'image') as { source: { media_type: string } };
    expect(image.source.media_type).toBe('image/png');
    const text = ai.calls[0]!.messages[0]!.content.find((b) => b.type === 'text') as { text: string };
    expect(text.text).toContain('מזומן, קניות לשבת');
    expect(sql('select raw_input from cash_spends')).toEqual([{ raw_input: '[קבלה] שופרסל דיל · מזומן, קניות לשבת · file:doc-id' }]);
  });

  it('a file over 10 MB is not downloaded; the bot asks for a regular photo', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(
      photoUpdate({ photo: undefined, document: { file_id: 'big', file_unique_id: 'b', mime_type: 'image/jpeg', file_size: 12_000_000 } }),
    );
    expect(telegram.downloads).toEqual([]);
    expect(ai.calls).toEqual([]);
    expect(sql('select id from cash_spends')).toEqual([]);
    expect(telegram.sent[0]!.text).toContain('גדולה');
  });

  it('a photo that is not a receipt: a friendly ask to type the amount, nothing saved', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    ai.output = receipt({ is_receipt: false, total_ils: null, business_name: null });
    await handleUpdate(photoUpdate());
    expect(sql('select id from cash_spends')).toEqual([]);
    expect(telegram.sent).toHaveLength(1);
    expect(telegram.sent[0]!.text).toContain('לכתוב');
  });

  it('a download that fails says so and saves nothing', async () => {
    telegram.failDownload = true;
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(photoUpdate());
    expect(sql('select id from cash_spends')).toEqual([]);
    expect(telegram.sent[0]!.text).toContain('שום דבר לא נרשם');
  });

  it('the same update twice is saved once', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    ai.output = receipt();
    const update = photoUpdate();
    await handleUpdate(update);
    await handleUpdate(update);
    expect(sql('select count(*)::int as n from cash_spends')).toEqual([{ n: 1 }]);
  });

  it('is announced in the family group, and works from inside the group too', async () => {
    run(`insert into app_settings (key, value) values ('telegram_group_chat_id', '${GROUP}')`);
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    ai.output = receipt();
    await handleUpdate(photoUpdate());
    const inGroup = telegram.sent.filter((m) => m.chatId === GROUP);
    expect(inGroup).toHaveLength(1);
    expect(inGroup[0]!.text).toContain('₪182.4');
    expect(inGroup[0]!.text).toContain('סופר');

    telegram.sent = [];
    await handleUpdate(photoUpdate({}, 111, { id: GROUP, type: 'group' }));
    expect(sql('select count(*)::int as n from cash_spends')).toEqual([{ n: 2 }]);
    expect(telegram.sent.map((m) => m.chatId)).toEqual([GROUP]);
  });

  it('in the family group, a photo that is not a receipt gets no reply', async () => {
    run(`insert into app_settings (key, value) values ('telegram_group_chat_id', '${GROUP}')`);
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    ai.output = receipt({ is_receipt: false, total_ils: null });
    await handleUpdate(photoUpdate({}, 111, { id: GROUP, type: 'group' }));
    expect(telegram.sent).toEqual([]);
    expect(sql('select id from cash_spends')).toEqual([]);
  });

  it('/start mentions photos of receipts', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    updateId += 1;
    await handleUpdate({
      update_id: updateId,
      message: { message_id: updateId, date: 0, chat: { id: 111, type: 'private' }, from: { id: 111, is_bot: false, first_name: 'N' }, text: '/start' },
    } as TelegramUpdate);
    expect(telegram.sent[0]!.text).toContain('קבלה');
  });
});
