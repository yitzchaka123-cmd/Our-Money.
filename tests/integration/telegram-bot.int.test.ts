import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IntakeResult } from '@/lib/intake/parse';
import type { TelegramUpdate } from '@/lib/telegram/types';
import type { RiseupTransaction } from '@/lib/types';

import { resetDb, seedMember, seedMonth, signIn, sql } from './helpers';

/**
 * The bot's video 2–4 items (group, ask-first mode, envelope picker, names,
 * reminder frequency, withdrawal wallet question) against the real database,
 * with Telegram and the AI replaced.
 */

const telegram = vi.hoisted(() => ({
  sent: [] as Array<{ chatId: number; text: string; keyboard?: Array<Array<{ text: string; callback_data: string }>> }>,
  edits: [] as Array<{ chatId: number; messageId: number; text: string; keyboard?: Array<Array<{ text: string; callback_data: string }>> }>,
  left: [] as number[],
  /** Chats that cannot be messaged (a member who never opened the bot). */
  unreachable: [] as number[],
}));
vi.mock('@/lib/telegram/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/telegram/client')>();
  return {
    ...original,
    sendMessage: async (chatId: number, text: string, keyboard?: Array<Array<{ text: string; callback_data: string }>>) => {
      if (telegram.unreachable.includes(chatId)) throw new Error('Forbidden: bot was blocked by the user');
      telegram.sent.push({ chatId, text, keyboard });
      return { message_id: 1000 + telegram.sent.length, chat: { id: chatId, type: 'private' }, date: 0 };
    },
    editMessageText: async (chatId: number, messageId: number, text: string, keyboard?: Array<Array<{ text: string; callback_data: string }>>) => {
      telegram.edits.push({ chatId, messageId, text, keyboard });
    },
    answerCallbackQuery: async () => {},
    sendTyping: async () => {},
    getMe: async () => ({ id: 999000, username: 'our_money_test_bot', first_name: 'Our Money' }),
    leaveChat: async (chatId: number) => {
      telegram.left.push(chatId);
    },
  };
});

// RiseUp: a month we do not otherwise use, with whatever transactions a test puts in.
const riseup = vi.hoisted(() => ({ transactions: [] as RiseupTransaction[] }));
vi.mock('@/lib/riseup/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/riseup/client')>();
  return {
    ...original,
    recentMonths: () => ['2026-10'],
    fetchTransactions: async () => riseup.transactions,
    fetchBudget: async () => ({ envelopes: [] }),
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
  telegram.left = [];
  telegram.unreachable = [];
  riseup.transactions = [];
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

const GROUP = -100777;
const BOT = { id: 999000, is_bot: true, first_name: 'Our Money', username: 'our_money_test_bot' };

function botAdded(by = 111, status: 'member' | 'left' = 'member'): TelegramUpdate {
  updateId += 1;
  return {
    update_id: updateId,
    my_chat_member: {
      chat: { id: GROUP, type: 'group', title: 'הבית שלנו' },
      from: { id: by, is_bot: false, first_name: by === 111 ? 'Nechemiah' : 'זר' },
      date: 0,
      old_chat_member: { status: status === 'member' ? 'left' : 'member', user: BOT },
      new_chat_member: { status, user: BOT },
    },
  } as TelegramUpdate;
}

function joinedServiceMessage(by = 111): TelegramUpdate {
  updateId += 1;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 0,
      chat: { id: GROUP, type: 'group', title: 'הבית שלנו' },
      from: { id: by, is_bot: false, first_name: 'Nechemiah' },
      new_chat_members: [BOT],
    },
  } as TelegramUpdate;
}

const storedGroup = () => sql<{ value: string }>(`select value from app_settings where key = 'telegram_group_chat_id'`);

describe('V4-3 / V3-1: the family group, set up with one tap', () => {
  it('remembers the group when one of us adds the bot, and says hello there once', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(botAdded());
    await handleUpdate(joinedServiceMessage());

    expect(storedGroup()).toEqual([{ value: String(GROUP) }]);
    const hello = telegram.sent.filter((m) => m.chatId === GROUP);
    expect(hello).toHaveLength(1);
    expect(hello[0]!.text).toContain('הקבוצה המשפחתית מחוברת');
  });

  it('a stranger cannot add it: polite no, it leaves, nothing is stored', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(botAdded(999));
    expect(storedGroup()).toEqual([]);
    expect(telegram.left).toEqual([GROUP]);
    expect(telegram.sent[0]!.text).toContain('פרטי');
  });

  it('forgets the group when the bot is removed from it', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(botAdded());
    await handleUpdate(botAdded(111, 'left'));
    expect(storedGroup()).toEqual([]);
  });

  it('announces a spend logged in private in the group: who, how much, which envelope', async () => {
    run(`update household_members set preferred_name = 'יצחק' where id = '${member}'`);
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(botAdded());
    telegram.sent = [];

    intake.next = spend(45, 'מזון וצריכה', 'שופרסל');
    await handleUpdate(textUpdate('45 בשופרסל'));
    const inGroup = telegram.sent.filter((m) => m.chatId === GROUP);
    expect(inGroup).toHaveLength(1);
    expect(inGroup[0]!.text).toContain('יצחק');
    expect(inGroup[0]!.text).toContain('₪45');
    expect(inGroup[0]!.text).toContain('סופר');
  });

  it('announces a change of envelope too', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(botAdded());
    intake.next = spend(45, 'אחר', 'פיתה');
    await handleUpdate(textUpdate('45 פיתה'));
    const reply = telegram.sent.find((m) => m.chatId === 111)!;
    telegram.sent = [];

    const where = { chatId: 111, messageId: 1002 };
    await handleUpdate(tap(buttonData(reply.keyboard, '✏️ שינוי קטגוריה'), where));
    await handleUpdate(tap(buttonData(telegram.edits.at(-1)!.keyboard, 'אוכל בחוץ'), where));
    const inGroup = telegram.sent.filter((m) => m.chatId === GROUP);
    expect(inGroup).toHaveLength(1);
    expect(inGroup[0]!.text).toContain('אוכל בחוץ');
  });

  it('in ask mode, the group hears about it once it is approved', async () => {
    run(`update household_members set bot_confirm_mode = 'ask' where id = '${member}'`);
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(botAdded());
    telegram.sent = [];
    intake.next = spend(845, 'אחר', 'סיבוניס');
    await handleUpdate(textUpdate('845 סיבוניס'));
    expect(telegram.sent.filter((m) => m.chatId === GROUP)).toHaveLength(0);

    const reply = telegram.sent.find((m) => m.chatId === 111)!;
    await handleUpdate(tap(buttonData(reply.keyboard, '✅ לאשר'), { chatId: 111, messageId: 1001 }));
    expect(telegram.sent.filter((m) => m.chatId === GROUP)).toHaveLength(1);
  });

  it('both of us can log from inside the group without @-mentioning the bot; chit-chat gets no reply', async () => {
    await seedMember(222, 'שרה');
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(botAdded());
    telegram.sent = [];

    intake.next = spend(30, 'אחר', 'קפה');
    await handleUpdate(textUpdate('30 על קפה', 222, { id: GROUP, type: 'group' }));
    expect(sql('select amount_ils from cash_spends')).toEqual([{ amount_ils: 30 }]);
    // One reply, in the group — and no second "announcement" of the same thing.
    expect(telegram.sent.map((m) => m.chatId)).toEqual([GROUP]);

    telegram.sent = [];
    intake.next = { intent: 'unclear', entries: [], replyNote: 'כמה זה היה?' };
    await handleUpdate(textUpdate('נתראה בערב', 111, { id: GROUP, type: 'group' }));
    expect(telegram.sent).toEqual([]);
  });

  it('stays a guest in any other group', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    intake.next = spend(30, 'אחר', 'קפה');
    await handleUpdate(textUpdate('30 על קפה', 111, { id: -555, type: 'group' }));
    expect(sql('select amount_ils from cash_spends')).toEqual([]);
  });

  it('/id speaks plain Hebrew and never asks to edit a server setting', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(textUpdate('/id'));
    const text = telegram.sent[0]!.text;
    expect(text).not.toContain('TELEGRAM_GROUP_CHAT_ID');
    expect(text).toContain('/group');
  });

  it('/group gives three steps and an add-to-group button', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(textUpdate('/group'));
    const reply = telegram.sent[0]!;
    expect(reply.text).toContain('שלושה צעדים');
    const button = (reply.keyboard as unknown as Array<Array<{ text: string; url: string }>>)[0]![0]!;
    expect(button.url).toBe('https://t.me/our_money_test_bot?startgroup=family');

    await handleUpdate(botAdded());
    telegram.sent = [];
    await handleUpdate(textUpdate('/group'));
    expect(telegram.sent[0]!.text).toContain('מחוברת');
    expect(telegram.sent[0]!.text).toContain('הבית שלנו');
  });

  it('an entry added on the dashboard is announced too', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(botAdded());
    telegram.sent = [];
    signIn(member);
    const { addCashEntry } = await import('@/lib/cash/actions');
    const result = await addCashEntry({
      kind: 'spend', amountIls: 60, category: 'סופר', note: 'ירקות', date: `${MONTH}-12`,
      envelopeId: SUPER_ID, memberId: null, walletId: null,
    });
    expect(result.ok).toBe(true);
    const inGroup = telegram.sent.filter((m) => m.chatId === GROUP);
    expect(inGroup).toHaveLength(1);
    expect(inGroup[0]!.text).toContain('₪60');
    expect(inGroup[0]!.text).toContain('סופר');
  });

  it('the evening reminder goes to the group the bot remembered', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(botAdded());
    telegram.sent = [];
    const { GET } = await import('@/app/api/cron/evening-nudge/route');
    await GET(new Request('https://our-money.test/api/cron/evening-nudge', { headers: { authorization: 'Bearer integration-cron-secret' } }));
    expect(telegram.sent.map((m) => m.chatId)).toEqual([GROUP]);
  });

  it('follows the group when Telegram turns it into a supergroup', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(botAdded());
    updateId += 1;
    await handleUpdate({
      update_id: updateId,
      message: { message_id: updateId, date: 0, chat: { id: GROUP, type: 'group' }, from: { id: 111, is_bot: false }, migrate_to_chat_id: -1009999 },
    } as TelegramUpdate);
    expect(storedGroup()).toEqual([{ value: '-1009999' }]);
  });
});

describe('V2-6b: a new ATM withdrawal asks which wallet the cash went into', () => {
  const atm = (id: string, amount = 500): RiseupTransaction => ({
    transactionId: id,
    transactionDate: '2026-10-14T00:00:00.000Z',
    cashflowDate: '2026-10',
    businessName: 'משיכת מזומן',
    isIncome: false,
    amount,
    sourceType: 'checkingAccount',
  });

  let saraWallet: string;
  beforeEach(() => {
    run(`insert into cash_wallets (name, is_default, position) values ('הארנק של שרה', false, 1)`);
    saraWallet = sql<{ id: string }>(`select id from cash_wallets where name = 'הארנק של שרה'`)[0]!.id;
  });

  const questions = () => telegram.sent.filter((m) => m.text.includes('זיהינו משיכה'));

  it('sends one message with a button per wallet, and never asks twice', async () => {
    const { syncRiseup } = await import('@/lib/riseup/sync');
    riseup.transactions = [atm('bank-1')];
    expect((await syncRiseup()).error).toBeNull();

    expect(questions()).toHaveLength(1);
    const q = questions()[0]!;
    expect(q.chatId).toBe(111);
    expect(q.text).toContain('זיהינו משיכה של <b>₪500</b> מהכספומט ב-14.10. לאיזה ארנק נכנס הכסף?');
    expect(buttonTexts(q.keyboard)).toEqual(['👛 ארנק ראשי', '👛 הארנק של שרה', '↩️ זו לא משיכה']);

    await syncRiseup();
    const { askWhichWallet } = await import('@/lib/telegram/withdrawal-question');
    expect(await askWhichWallet()).toBe(0);
    expect(questions()).toHaveLength(1);
    expect(sql('select wallet_asked_at is not null as asked from cash_topups')).toEqual([{ asked: true }]);
  });

  it('the button moves the withdrawal into that wallet', async () => {
    const { syncRiseup } = await import('@/lib/riseup/sync');
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    riseup.transactions = [atm('bank-1')];
    await syncRiseup();
    const q = questions()[0]!;

    await handleUpdate(tap(buttonData(q.keyboard, '👛 הארנק של שרה'), { chatId: 111, messageId: 1001 }));
    expect(sql('select wallet_id from cash_topups')).toEqual([{ wallet_id: saraWallet }]);
    expect(telegram.edits.at(-1)!.text).toContain('נכנסה להארנק של שרה');
  });

  it('asks in the family group instead, when there is one', async () => {
    await seedMember(222, 'שרה');
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(botAdded());
    const { syncRiseup } = await import('@/lib/riseup/sync');
    riseup.transactions = [atm('bank-1')];
    await syncRiseup();
    expect(questions().map((m) => m.chatId)).toEqual([GROUP]);
  });

  it('refuses a button from a wallet list that has since changed', async () => {
    const { syncRiseup } = await import('@/lib/riseup/sync');
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    riseup.transactions = [atm('bank-1')];
    await syncRiseup();
    const q = questions()[0]!;
    run(`update cash_wallets set position = -1 where id = '${saraWallet}'`);

    await handleUpdate(tap(buttonData(q.keyboard, '👛 הארנק של שרה'), { chatId: 111, messageId: 1001 }));
    expect(sql('select wallet_id <> \'' + saraWallet + '\' as untouched from cash_topups')).toEqual([{ untouched: true }]);
  });

  it('tries again on the next sync when nobody could be reached', async () => {
    telegram.unreachable = [111];
    const { syncRiseup } = await import('@/lib/riseup/sync');
    riseup.transactions = [atm('bank-1')];
    await syncRiseup();
    expect(sql('select wallet_asked_at is null as open from cash_topups')).toEqual([{ open: true }]);

    telegram.unreachable = [];
    await syncRiseup();
    expect(questions()).toHaveLength(1);
  });

  it('with one wallet, just says where the cash went', async () => {
    run(`delete from cash_wallets where id = '${saraWallet}'`);
    const { syncRiseup } = await import('@/lib/riseup/sync');
    riseup.transactions = [atm('bank-1')];
    await syncRiseup();
    expect(questions()[0]!.text).toContain('הכסף נכנס לארנק ראשי');
    expect(buttonTexts(questions()[0]!.keyboard)).toEqual(['↩️ זו לא משיכה']);
  });
});
