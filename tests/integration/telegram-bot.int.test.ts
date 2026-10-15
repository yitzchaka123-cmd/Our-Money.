import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IntakeResult } from '@/lib/intake/parse';
import type { TelegramUpdate } from '@/lib/telegram/types';

import { resetDb, seedMember, seedMonth, sql } from './helpers';

/**
 * The bot's video 2–4 items (group, ask-first mode, envelope picker, names,
 * reminder frequency, withdrawal wallet question) against the real database,
 * with Telegram and the AI replaced.
 */

const telegram = vi.hoisted(() => ({
  sent: [] as Array<{ chatId: number; text: string; keyboard?: Array<Array<{ text: string; callback_data: string }>> }>,
  edits: [] as Array<{ chatId: number; messageId: number; text: string; keyboard?: Array<Array<{ text: string; callback_data: string }>> }>,
}));
vi.mock('@/lib/telegram/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/telegram/client')>();
  return {
    ...original,
    sendMessage: async (chatId: number, text: string, keyboard?: Array<Array<{ text: string; callback_data: string }>>) => {
      telegram.sent.push({ chatId, text, keyboard });
      return { message_id: 1000 + telegram.sent.length, chat: { id: chatId, type: 'private' }, date: 0 };
    },
    editMessageText: async (chatId: number, messageId: number, text: string, keyboard?: Array<Array<{ text: string; callback_data: string }>>) => {
      telegram.edits.push({ chatId, messageId, text, keyboard });
    },
    answerCallbackQuery: async () => {},
    sendTyping: async () => {},
    getMe: async () => ({ id: 999000, username: 'our_money_test_bot', first_name: 'Our Money' }),
  };
});

const intake = vi.hoisted(() => ({ next: null as IntakeResult | null }));
vi.mock('@/lib/intake/parse', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/intake/parse')>();
  return { ...original, parseIntake: async () => intake.next! };
});

const MONTH = '2026-09';
let updateId = 5000;

function textUpdate(
  text: string,
  from = 111,
  chat: { id: number; type: 'private' | 'group' | 'supergroup' } = { id: from, type: 'private' },
): TelegramUpdate {
  updateId += 1;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 0,
      chat,
      from: { id: from, is_bot: false, first_name: 'Nechemiah', last_name: 'Seltzer' },
      text,
    },
  } as TelegramUpdate;
}

function spend(amountIls: number, category: string, note = ''): IntakeResult {
  return {
    intent: 'log_expense',
    replyNote: null,
    entries: [{ direction: 'expense', wallet: null, amountIls, category, note, spentAt: `${MONTH}-10`, confidence: 'high' }],
  };
}

let member: string;

/** A plain write through psql (the shared helper only reads). */
function run(statement: string): void {
  execFileSync(
    join(process.env.TEST_PG_BIN!, 'psql'),
    ['-h', '127.0.0.1', '-p', process.env.TEST_PG_PORT!, '-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-c', statement],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PGOPTIONS: '-c search_path=money' } },
  );
}

beforeEach(async () => {
  resetDb();
  member = await seedMember(111, 'Nechemiah Seltzer');
  await seedMonth(MONTH);
  telegram.sent = [];
  telegram.edits = [];
});

describe('V3-3: the bot uses the name you chose', () => {
  it('signs a saved spend with the preferred name, never the Telegram one', async () => {
    run(`update household_members set preferred_name = 'יצחק' where id = '${member}'`);
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    intake.next = spend(45, 'אוכל בחוץ', 'פלאפל');
    await handleUpdate(textUpdate('45 פלאפל'));

    const reply = telegram.sent[0]!.text;
    expect(reply).toContain('נרשם · יצחק');
    expect(reply).not.toContain('Nechemiah');
  });

  it('uses the preferred name in /month', async () => {
    run(`update household_members set preferred_name = 'יצחק' where id = '${member}'`);
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    intake.next = spend(45, 'אוכל בחוץ', 'פלאפל');
    await handleUpdate(textUpdate('45 פלאפל'));
    telegram.sent = [];
    await handleUpdate(textUpdate(`/month ${MONTH}`));
    expect(telegram.sent[0]!.text).toContain('יצחק');
    expect(telegram.sent[0]!.text).not.toContain('Nechemiah');
  });

  it('keeps the Telegram name only until a name is chosen', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    intake.next = spend(45, 'אוכל בחוץ', 'פלאפל');
    await handleUpdate(textUpdate('45 פלאפל'));
    expect(telegram.sent[0]!.text).toContain('Nechemiah Seltzer');
  });
});
