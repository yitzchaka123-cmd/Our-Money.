import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IntakeResult } from '@/lib/intake/parse';
import type { TelegramUpdate } from '@/lib/telegram/types';
import type { RiseupTransaction } from '@/lib/types';

import { resetDb, seedMember, signIn, sql } from './helpers';

/**
 * C26: "מה קניתם כאן?" — after a sync the bot asks once about a charge at a
 * business never seen before, and a reply becomes the charge's note. The
 * database is real; Telegram, RiseUp and the AI are fakes.
 */

const telegram = vi.hoisted(() => ({
  sent: [] as Array<{ chatId: number; text: string; messageId: number; forceReply?: string }>,
  unreachable: [] as number[],
  nextId: 7000,
}));
vi.mock('@/lib/telegram/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/telegram/client')>();
  const send = (chatId: number, text: string, forceReply?: string) => {
    if (telegram.unreachable.includes(chatId)) throw new Error('Forbidden: bot was blocked by the user');
    telegram.nextId += 1;
    telegram.sent.push({ chatId, text, messageId: telegram.nextId, forceReply });
    return { message_id: telegram.nextId, chat: { id: chatId, type: chatId < 0 ? 'group' : 'private' }, date: 0 };
  };
  return {
    ...original,
    sendMessage: async (chatId: number, text: string) => send(chatId, text),
    sendForceReply: async (chatId: number, text: string, placeholder: string) => send(chatId, text, placeholder),
    editMessageText: async () => {},
    answerCallbackQuery: async () => {},
    sendTyping: async () => {},
    getMe: async () => ({ id: 999000, username: 'our_money_test_bot', first_name: 'Our Money' }),
  };
});

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

function run(statement: string): void {
  execFileSync(
    join(process.env.TEST_PG_BIN!, 'psql'),
    ['-h', '127.0.0.1', '-p', process.env.TEST_PG_PORT!, '-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-c', statement],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PGOPTIONS: '-c search_path=money' } },
  );
}

function charge(id: string, business: string, extra: Partial<RiseupTransaction> = {}): RiseupTransaction {
  return {
    transactionId: id,
    transactionDate: '2026-10-15T00:00:00.000Z',
    cashflowDate: '2026-10',
    businessName: business,
    isIncome: false,
    amount: 89.9,
    sourceType: 'creditCard',
    source: 'isracard',
    accountNumberHash: 'card-1',
    ...extra,
  };
}

let updateId = 9000;
function replyTo(question: { chatId: number; messageId: number }, text: string, from = 111): TelegramUpdate {
  updateId += 1;
  const chat = { id: question.chatId, type: question.chatId < 0 ? 'group' : 'private' } as const;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 0,
      chat,
      from: { id: from, is_bot: false, first_name: 'Nechemiah' },
      text,
      reply_to_message: {
        message_id: question.messageId,
        date: 0,
        chat,
        from: { id: 999000, is_bot: true, first_name: 'Our Money' },
        text: 'question',
      },
    },
  } as TelegramUpdate;
}

const questions = () => telegram.sent.filter((m) => m.forceReply);
const notes = () => sql<{ transaction_id: string; note: string; month: string }>('select transaction_id, note, month from transaction_notes order by transaction_id');

let member: string;

beforeEach(async () => {
  resetDb();
  run('truncate app_settings, business_questions, transaction_notes');
  member = await seedMember(111, 'Nechemiah Seltzer');
  // A business we have known for a month.
  run(`insert into riseup_transactions (transaction_id, transaction_date, business_name, amount_ils, is_income, first_seen_at)
       values ('old-1', '2026-09-10', 'שופרסל דיל', 300, false, now() - interval '30 days')`);
  run(`insert into account_labels (source, account_number_hash, label) values ('isracard', 'card-1', 'הכרטיס של שרה')`);
  telegram.sent = [];
  telegram.unreachable = [];
  riseup.transactions = [];
});

describe('C26: the question after a sync', () => {
  it('asks once about a new business only — not a known one, income or a withdrawal', async () => {
    const { syncRiseup } = await import('@/lib/riseup/sync');
    riseup.transactions = [
      charge('new-1', 'דל פסטו'),
      charge('known-1', 'שופרסל דיל'),
      charge('salary', 'משכורת', { isIncome: true, amount: 12000 }),
      charge('atm', 'משיכת מזומן', { sourceType: 'checkingAccount', amount: 500 }),
    ];
    expect((await syncRiseup()).error).toBeNull();

    expect(questions()).toHaveLength(1);
    const q = questions()[0]!;
    expect(q.chatId).toBe(111);
    expect(q.text).toBe('🛍 חיוב חדש: <b>₪89.90</b> ב-דל פסטו (15.10, הכרטיס של שרה). מה קניתם? אפשר לענות בהודעה (או ״דלג״).');
    expect(q.forceReply).toBe('למשל: שניצל');
    expect(sql('select transaction_id, status, messages from business_questions')).toEqual([
      { transaction_id: 'new-1', status: 'asked', messages: [`111:${q.messageId}`] },
    ]);

    // The next sync — and a later charge at the same place — ask nothing.
    riseup.transactions.push(charge('new-2', 'דל פסטו', { transactionDate: '2026-10-16T00:00:00.000Z' }));
    await syncRiseup();
    expect(questions()).toHaveLength(1);
  });

  it('asks at most five per sync; the rest come with the next one', async () => {
    const { syncRiseup } = await import('@/lib/riseup/sync');
    riseup.transactions = Array.from({ length: 7 }, (_, i) => charge(`n-${i}`, `עסק ${i}`));
    await syncRiseup();
    expect(questions()).toHaveLength(5);
    await syncRiseup();
    expect(questions()).toHaveLength(7);
    await syncRiseup();
    expect(questions()).toHaveLength(7);
  });

  it('skips a charge that already has a note', async () => {
    run(`insert into transaction_notes (transaction_id, month, note) values ('new-1', '2026-10', 'מתנה לאמא')`);
    const { syncRiseup } = await import('@/lib/riseup/sync');
    riseup.transactions = [charge('new-1', 'דל פסטו')];
    await syncRiseup();
    expect(questions()).toHaveLength(0);
  });

  it('asks in the family group when there is one, and tries again when nobody was reached', async () => {
    const { askAboutNewBusinesses } = await import('@/lib/telegram/business-question');
    const { syncRiseup } = await import('@/lib/riseup/sync');
    telegram.unreachable = [111];
    riseup.transactions = [charge('new-1', 'דל פסטו')];
    await syncRiseup();
    expect(questions()).toHaveLength(0);
    expect(sql('select * from business_questions')).toEqual([]);

    run(`insert into app_settings (key, value) values ('telegram_group_chat_id', '-100777')`);
    expect(await askAboutNewBusinesses()).toBe(1);
    expect(questions().map((q) => q.chatId)).toEqual([-100777]);
  });

  it('is off when the household turned it off in Settings → טלגרם', async () => {
    signIn(member);
    const { setBotFeature } = await import('@/lib/telegram/bot-features-actions');
    expect(await setBotFeature('ask_new_business', false)).toEqual({ ok: true });
    const { syncRiseup } = await import('@/lib/riseup/sync');
    riseup.transactions = [charge('new-1', 'דל פסטו')];
    await syncRiseup();
    expect(questions()).toHaveLength(0);
  });
});

describe('C26: the answer', () => {
  async function ask(): Promise<{ chatId: number; messageId: number }> {
    const { syncRiseup } = await import('@/lib/riseup/sync');
    riseup.transactions = [charge('new-1', 'דל פסטו')];
    await syncRiseup();
    return questions()[0]!;
  }

  it('a reply becomes the charge’s note, the same note the dashboard shows', async () => {
    const q = await ask();
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(replyTo(q, 'שניצל'));

    expect(notes()).toEqual([{ transaction_id: 'new-1', note: 'שניצל', month: '2026-10' }]);
    expect(telegram.sent.at(-1)!.text).toBe('נשמר ✅ דל פסטו: שניצל');
    expect(sql('select status, answered_by from business_questions')).toEqual([{ status: 'answered', answered_by: member }]);
    // Nothing was logged as a cash spend.
    expect(sql('select id from cash_spends')).toEqual([]);
  });

  it('"דלג" answers without a note', async () => {
    const q = await ask();
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(replyTo(q, 'דלג'));
    expect(notes()).toEqual([]);
    expect(sql('select status from business_questions')).toEqual([{ status: 'skipped' }]);
    expect(telegram.sent.at(-1)!.text).toContain('דילגנו');
  });

  it('works in the family group too', async () => {
    run(`insert into app_settings (key, value) values ('telegram_group_chat_id', '-100777')`);
    const q = await ask();
    expect(q.chatId).toBe(-100777);
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(replyTo(q, 'פסטה לשניים'));
    expect(notes()).toEqual([{ transaction_id: 'new-1', note: 'פסטה לשניים', month: '2026-10' }]);
  });

  it('ignores a stranger, and leaves replies to other bot messages to the usual flow', async () => {
    const q = await ask();
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(replyTo(q, 'שניצל', 555));
    expect(notes()).toEqual([]);

    intake.next = {
      intent: 'log_expense',
      replyNote: null,
      entries: [{ direction: 'expense', wallet: null, amountIls: 45, category: 'אוכל בחוץ', note: 'פלאפל', spentAt: '2026-10-15', confidence: 'high' }],
    };
    await handleUpdate(replyTo({ chatId: 111, messageId: 1 }, '45 פלאפל'));
    expect(sql('select amount_ils from cash_spends')).toEqual([{ amount_ils: 45 }]);
    expect(notes()).toEqual([]);
  });
});
