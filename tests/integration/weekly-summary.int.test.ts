import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDb, seedMember, seedMonth, signIn, sql } from './helpers';

/**
 * C24: the Sunday summary in Telegram, against the real database, with a fake
 * Telegram that records what it was asked to send.
 */

const telegram = vi.hoisted(() => ({
  sent: [] as Array<{ chatId: number; text: string }>,
  unreachable: [] as number[],
}));
vi.mock('@/lib/telegram/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/telegram/client')>();
  return {
    ...original,
    sendMessage: async (chatId: number, text: string) => {
      if (telegram.unreachable.includes(chatId)) throw new Error('Forbidden: bot was blocked by the user');
      telegram.sent.push({ chatId, text });
      return { message_id: 1000 + telegram.sent.length, chat: { id: chatId, type: 'private' }, date: 0 };
    },
  };
});

function run(statement: string): void {
  execFileSync(
    join(process.env.TEST_PG_BIN!, 'psql'),
    ['-h', '127.0.0.1', '-p', process.env.TEST_PG_PORT!, '-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-c', statement],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PGOPTIONS: '-c search_path=money' } },
  );
}

const MONTH = '2026-10';
/** Sunday 11 October 2026, 09:00 in Israel: the week is 4–10 October. */
const SUNDAY = new Date('2026-10-11T06:00:00Z');

let first: string;

beforeEach(async () => {
  resetDb();
  run('truncate app_settings');
  first = await seedMember(111, 'Nechemiah Seltzer');
  await seedMember(222, 'שרה');
  run(`update household_members set preferred_name = 'יצחק' where id = '${first}'`);
  await seedMonth(MONTH);
  // Cash on the 6th, out of the default wallet.
  run(`insert into cash_spends (member_id, amount_ils, category, note, spent_at, input_kind, status)
       values ('${first}', 80, 'אוכל בחוץ', 'פלאפל', '${MONTH}-06', 'text', 'confirmed')`);
  telegram.sent = [];
  telegram.unreachable = [];
});

describe('C24: the weekly summary', () => {
  it('keeps the endpoint behind the cron secret', async () => {
    const { GET } = await import('@/app/api/cron/weekly-summary/route');
    expect((await GET(new Request('https://our-money.test/api/cron/weekly-summary'))).status).toBe(401);
  });

  it('sends each member one message with the same figures the dashboard shows', async () => {
    const { sendWeeklySummary } = await import('@/lib/telegram/weekly-summary-send');
    const outcome = await sendWeeklySummary(SUNDAY);
    expect(outcome).toEqual({ sent: 2, week: '2026-10-11' });
    expect(telegram.sent.map((m) => m.chatId).sort()).toEqual([111, 222]);

    const text = telegram.sent.find((m) => m.chatId === 111)!.text;
    expect(text).toContain('בוקר טוב, יצחק!');
    expect(text).not.toContain('Nechemiah');
    expect(text).toContain('4.10–10.10');
    // 3,000 + 3,500 + 100 from RiseUp and 80 in cash; the ATM line is not spending.
    expect(text).toContain('<b>₪6,680</b>');
    expect(text).toContain('(מזה ₪80 במזומן)');
    expect(text).toContain('https://our-money.test/dashboard');

    const { loadDashboard } = await import('@/lib/dashboard/data');
    const data = await loadDashboard(MONTH);
    const forecast = Math.round(data.forecast);
    expect(text).toContain(`₪${Math.abs(forecast).toLocaleString('he-IL')}`);
    expect(text).toContain(forecast >= 0 ? 'בפלוס של' : 'במינוס של');
  });

  it('never sends the same week twice', async () => {
    const { sendWeeklySummary } = await import('@/lib/telegram/weekly-summary-send');
    await sendWeeklySummary(SUNDAY);
    telegram.sent = [];
    expect(await sendWeeklySummary(new Date('2026-10-11T08:00:00Z'))).toMatchObject({ sent: 0, skipped: 'already_sent' });
    expect(telegram.sent).toHaveLength(0);

    // The next Sunday is a new week.
    expect(await sendWeeklySummary(new Date('2026-10-18T06:00:00Z'))).toMatchObject({ sent: 2, week: '2026-10-18' });
    expect(sql(`select value from app_settings where key = 'weekly_summary_week'`)).toEqual([{ value: '2026-10-18' }]);
  });

  it('goes to the family group alone when there is one, greeting both', async () => {
    run(`insert into app_settings (key, value) values ('telegram_group_chat_id', '-100777')`);
    const { sendWeeklySummary } = await import('@/lib/telegram/weekly-summary-send');
    await sendWeeklySummary(SUNDAY);
    expect(telegram.sent.map((m) => m.chatId)).toEqual([-100777]);
    expect(telegram.sent[0]!.text).toContain('בוקר טוב, יצחק ושרה!');
  });

  it('tries again next run when nobody could be reached', async () => {
    telegram.unreachable = [111, 222];
    const { sendWeeklySummary } = await import('@/lib/telegram/weekly-summary-send');
    expect(await sendWeeklySummary(SUNDAY)).toMatchObject({ sent: 0, skipped: 'nobody' });
    telegram.unreachable = [];
    expect(await sendWeeklySummary(SUNDAY)).toMatchObject({ sent: 2 });
  });

  it('is off when the household turned it off in Settings → טלגרם', async () => {
    signIn(first);
    const { setBotFeature } = await import('@/lib/telegram/bot-features-actions');
    expect(await setBotFeature('weekly_summary', false)).toEqual({ ok: true });
    const { loadBotFeatures } = await import('@/lib/telegram/bot-features-load');
    expect(await loadBotFeatures()).toEqual({ weekly_summary: false, ask_new_business: true });

    const { GET } = await import('@/app/api/cron/weekly-summary/route');
    const response = await GET(
      new Request('https://our-money.test/api/cron/weekly-summary', { headers: { authorization: 'Bearer integration-cron-secret' } }),
    );
    expect(await response.json()).toMatchObject({ ok: true, skipped: 'off' });
    expect(telegram.sent).toHaveLength(0);

    expect(await setBotFeature('weekly_summary', true)).toEqual({ ok: true });
    expect((await loadBotFeatures()).weekly_summary).toBe(true);
  });
});
