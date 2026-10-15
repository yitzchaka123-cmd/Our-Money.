import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IntakeResult } from '@/lib/intake/parse';
import type { TelegramUpdate } from '@/lib/telegram/types';

import { resetDb, seedMember, seedMonth, signIn, sql } from './helpers';

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

const SUPER_ID = `${MONTH}#trackingCategory#v2-default-il-expense-category-2#0`;

beforeEach(async () => {
  resetDb();
  run('truncate tracker_overrides, app_settings');
  member = await seedMember(111, 'Nechemiah Seltzer');
  await seedMonth(MONTH);
  // RiseUp's supermarket tracker, which RiseUp names "כלכלה" and the couple renamed "סופר".
  run(`insert into riseup_envelopes (month, envelope_id, envelope_type, name, planned_ils, actual_ils, position)
       values ('${MONTH}', '${SUPER_ID}', 'trackingCategory', 'כלכלה', 3000, 0, 5)`);
  run(`insert into tracker_overrides (tracker_key, month, name) values ('v2-default-il-expense-category-2', '', 'סופר')`);
  const { resetCategoryCache } = await import('@/lib/intake/categories');
  resetCategoryCache();
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

describe("V4-2: the evening reminder follows each person's setting", () => {
  afterEach(() => vi.useRealTimers());

  async function runNudge(isoInstant: string): Promise<number[]> {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(isoInstant));
    const { GET } = await import('@/app/api/cron/evening-nudge/route');
    telegram.sent = [];
    await GET(new Request('https://our-money.test/api/cron/evening-nudge', { headers: { authorization: 'Bearer integration-cron-secret' } }));
    vi.useRealTimers();
    return telegram.sent.map((m) => m.chatId);
  }

  it('saves the choice from Settings and the cron obeys it', async () => {
    const sara = await seedMember(222, 'שרה');
    signIn(member);
    const { setNudgeFrequency } = await import('@/lib/telegram/settings-actions');
    expect(await setNudgeFrequency(member, 'weekly')).toEqual({ ok: true });
    expect(await setNudgeFrequency(sara, 'never')).toEqual({ ok: true });
    expect(sql(`select nudge_frequency from household_members order by telegram_user_id`)).toEqual([
      { nudge_frequency: 'weekly' },
      { nudge_frequency: 'never' },
    ]);

    // Thursday evening: weekly (Sunday) is not today, never is never.
    expect(await runNudge('2026-10-15T17:00:00Z')).toEqual([]);
    // Sunday evening: the weekly one comes, only to him.
    expect(await runNudge('2026-10-18T17:00:00Z')).toEqual([111]);
  });

  it('keeps the daily reminder for anyone who never chose', async () => {
    expect(await runNudge('2026-10-16T17:00:00Z')).toEqual([111]);
  });

  it('refuses a choice it does not know, and needs a session', async () => {
    const { setNudgeFrequency } = await import('@/lib/telegram/settings-actions');
    expect((await setNudgeFrequency(member, 'daily')).ok).toBe(false);
    signIn(member);
    expect((await setNudgeFrequency(member, 'hourly' as never)).ok).toBe(false);
  });
});

describe('V3-2 / V2-10: spends land in the household’s own envelopes', () => {
  it('files a supermarket spend into "סופר", whatever label the AI used', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    intake.next = spend(45, 'מזון וצריכה', 'שופרסל');
    await handleUpdate(textUpdate('45 בשופרסל'));

    expect(sql('select category, envelope_id, envelope_type from cash_spends')).toEqual([
      { category: 'סופר', envelope_id: SUPER_ID, envelope_type: 'trackingCategory' },
    ]);
    expect(telegram.sent[0]!.text).toContain('סופר');
    expect(telegram.sent[0]!.text).not.toContain('מזון וצריכה');
  });

  it('files the unknown into "הוצאות משתנות", never "אחר"', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    intake.next = spend(845, 'אחר', 'סיבוניס');
    await handleUpdate(textUpdate('845 סיבוניס'));
    expect(sql('select category, envelope_id from cash_spends')).toEqual([
      { category: 'הוצאות משתנות', envelope_id: `${MONTH}-var` },
    ]);
  });

  it('groups /month by the same envelope names', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    intake.next = spend(45, 'מזון וצריכה', 'סופר');
    await handleUpdate(textUpdate('45 סופר'));
    intake.next = spend(845, 'אחר', 'סיבוניס');
    await handleUpdate(textUpdate('845 סיבוניס'));
    telegram.sent = [];

    await handleUpdate(textUpdate(`/month ${MONTH}`));
    const text = telegram.sent[0]!.text;
    expect(text).toContain('לפי מעטפה');
    expect(text).toContain('הוצאות משתנות: ₪845 (1)');
    expect(text).toContain('סופר: ₪45 (1)');
    expect(text).not.toMatch(/אחר:|מזון וצריכה/);
  });

  it('lists the envelopes for /categories', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(textUpdate('/categories'));
    const text = telegram.sent[0]!.text;
    for (const name of ['סופר', 'אוכל בחוץ', 'הוצאות משתנות', 'הוצאות קבועות']) expect(text).toContain(name);
    expect(text).not.toContain('כלכלה');
  });
});

function tap(data: string, message: { chatId: number; messageId: number }, from = 111): TelegramUpdate {
  updateId += 1;
  return {
    update_id: updateId,
    callback_query: {
      id: `cb-${updateId}`,
      from: { id: from, is_bot: false, first_name: 'Nechemiah' },
      data,
      message: { message_id: message.messageId, date: 0, chat: { id: message.chatId, type: 'private' } },
    },
  } as TelegramUpdate;
}

const buttonTexts = (keyboard?: Array<Array<{ text: string }>>) => (keyboard ?? []).flat().map((b) => b.text);
const buttonData = (keyboard: Array<Array<{ text: string; callback_data: string }>> | undefined, text: string) =>
  (keyboard ?? []).flat().find((b) => b.text === text)!.callback_data;

describe('V4-4: ask before saving, and a picker of your own envelopes with a way back', () => {
  async function logInAskMode() {
    run(`update household_members set bot_confirm_mode = 'ask' where id = '${member}'`);
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    intake.next = spend(845, 'אחר', 'סיבוניס');
    await handleUpdate(textUpdate('845 סיבוניס'));
    const reply = telegram.sent[0]!;
    return { handleUpdate, reply, where: { chatId: reply.chatId, messageId: 1001 } };
  }

  it('in ask mode the spend waits, with לאשר / שינוי קטגוריה / מחיקה', async () => {
    const { reply } = await logInAskMode();
    expect(sql('select status from cash_spends')).toEqual([{ status: 'needs_review' }]);
    expect(reply.text).toContain('לאשר');
    expect(buttonTexts(reply.keyboard)).toEqual(['✅ לאשר', '✏️ שינוי קטגוריה', '🗑 מחיקה']);
  });

  it('לאשר approves it and redraws the message as saved', async () => {
    const { handleUpdate, reply, where } = await logInAskMode();
    await handleUpdate(tap(buttonData(reply.keyboard, '✅ לאשר'), where));
    expect(sql('select status from cash_spends')).toEqual([{ status: 'confirmed' }]);
    const edit = telegram.edits.at(-1)!;
    expect(edit.text).toContain('✅ נרשם');
    expect(buttonTexts(edit.keyboard)).toEqual(['✏️ שינוי קטגוריה', '🗑 מחיקה']);
  });

  it('the picker shows only this month’s envelopes by name, plus חזרה', async () => {
    const { handleUpdate, reply, where } = await logInAskMode();
    await handleUpdate(tap(buttonData(reply.keyboard, '✏️ שינוי קטגוריה'), where));
    const picker = telegram.edits.at(-1)!;
    expect(buttonTexts(picker.keyboard)).toEqual(['אוכל בחוץ', 'סופר', 'הוצאות משתנות', 'הוצאות קבועות', '↩️ חזרה']);
  });

  it('חזרה puts the original message back, untouched', async () => {
    const { handleUpdate, reply, where } = await logInAskMode();
    await handleUpdate(tap(buttonData(reply.keyboard, '✏️ שינוי קטגוריה'), where));
    const picker = telegram.edits.at(-1)!;
    await handleUpdate(tap(buttonData(picker.keyboard, '↩️ חזרה'), where));
    const back = telegram.edits.at(-1)!;
    expect(back.text).toBe(reply.text);
    expect(back.keyboard).toEqual(reply.keyboard);
    expect(sql('select status, category from cash_spends')).toEqual([{ status: 'needs_review', category: 'הוצאות משתנות' }]);
  });

  it('choosing an envelope files it there and keeps waiting for לאשר', async () => {
    const { handleUpdate, reply, where } = await logInAskMode();
    await handleUpdate(tap(buttonData(reply.keyboard, '✏️ שינוי קטגוריה'), where));
    const picker = telegram.edits.at(-1)!;
    await handleUpdate(tap(buttonData(picker.keyboard, 'סופר'), where));
    expect(sql('select status, category, envelope_id from cash_spends')).toEqual([
      { status: 'needs_review', category: 'סופר', envelope_id: SUPER_ID },
    ]);
    const redrawn = telegram.edits.at(-1)!;
    expect(redrawn.text).toContain('סופר');
    expect(buttonTexts(redrawn.keyboard)).toContain('✅ לאשר');
  });

  it('in instant mode it is saved at once, and a new envelope keeps it saved', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    intake.next = spend(45, 'אחר', 'פיתה');
    await handleUpdate(textUpdate('45 פיתה'));
    const reply = telegram.sent[0]!;
    expect(sql('select status from cash_spends')).toEqual([{ status: 'confirmed' }]);
    expect(buttonTexts(reply.keyboard)).toEqual(['✏️ שינוי קטגוריה', '🗑 מחיקה']);

    const where = { chatId: reply.chatId, messageId: 1001 };
    await handleUpdate(tap(buttonData(reply.keyboard, '✏️ שינוי קטגוריה'), where));
    await handleUpdate(tap(buttonData(telegram.edits.at(-1)!.keyboard, 'אוכל בחוץ'), where));
    expect(sql('select status, envelope_id from cash_spends')).toEqual([{ status: 'confirmed', envelope_id: `${MONTH}-food` }]);
  });

  it('saves the setting from Settings → טלגרם', async () => {
    signIn(member);
    const { setConfirmMode } = await import('@/lib/telegram/settings-actions');
    expect(await setConfirmMode(member, 'ask')).toEqual({ ok: true });
    expect(sql('select bot_confirm_mode from household_members')).toEqual([{ bot_confirm_mode: 'ask' }]);
  });
});
