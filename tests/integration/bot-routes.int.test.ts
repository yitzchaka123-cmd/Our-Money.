import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPlan } from '@/lib/cash/plan-actions';
import type { IntakeResult } from '@/lib/intake/parse';
import { encodeCallback } from '@/lib/telegram/format';
import type { TelegramUpdate } from '@/lib/telegram/types';

import { cookieJar, resetDb, seedMember, seedMonth, signIn, sql } from './helpers';

// The two outside services the bot talks to are replaced; the database is real.
const telegram = vi.hoisted(() => ({ sent: [] as Array<{ chatId: number; text: string; keyboard?: unknown }>, edits: [] as string[] }));
vi.mock('@/lib/telegram/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/telegram/client')>();
  return {
    ...original,
    sendMessage: async (chatId: number, text: string, keyboard?: unknown) => {
      telegram.sent.push({ chatId, text, keyboard });
      return { message_id: telegram.sent.length, chat: { id: chatId, type: 'private' }, date: 0 };
    },
    editMessageText: async (_chat: number, _id: number, text: string) => {
      telegram.edits.push(text);
    },
    answerCallbackQuery: async () => {},
    sendTyping: async () => {},
  };
});

const intake = vi.hoisted(() => ({ next: null as IntakeResult | null }));
vi.mock('@/lib/intake/parse', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/intake/parse')>();
  return { ...original, parseIntake: async () => intake.next! };
});

const MONTH = '2026-09';
let updateId = 1;

function textUpdate(text: string, from = 111, chat: { id: number; type: 'private' | 'group' } = { id: 111, type: 'private' }): TelegramUpdate {
  updateId += 1;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 0,
      chat,
      from: { id: from, is_bot: false, first_name: from === 111 ? 'יצחק' : 'זר' },
      text,
    },
  } as TelegramUpdate;
}

let member: string;

beforeEach(async () => {
  resetDb();
  member = await seedMember(111, 'יצחק');
  await seedMonth(MONTH);
  telegram.sent = [];
  telegram.edits = [];
});

describe('the bot, against the real database', () => {
  it('files a spoken spend into its tracker and records a withdrawal into the wallet', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    intake.next = {
      intent: 'log_expense',
      replyNote: null,
      entries: [
        { direction: 'expense', wallet: null, amountIls: 80, category: 'אוכל בחוץ', note: 'פלאפל', spentAt: `${MONTH}-10`, confidence: 'high' },
        { direction: 'withdrawal', wallet: null, amountIls: 500, category: 'משיכה', note: '', spentAt: `${MONTH}-10`, confidence: 'high' },
      ],
    };
    await handleUpdate(textUpdate('80 על פלאפל ומשכתי 500'));

    expect(sql('select amount_ils, envelope_id, status from cash_spends')).toEqual([
      { amount_ils: 80, envelope_id: `${MONTH}-food`, status: 'confirmed' },
    ]);
    expect(sql('select amount_ils, source from cash_topups')).toEqual([{ amount_ils: 500, source: 'manual' }]);
    expect(telegram.sent.length).toBeGreaterThanOrEqual(2);
  });

  it('undoes the latest entry with /undo', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    intake.next = {
      intent: 'log_expense',
      replyNote: null,
      entries: [{ direction: 'expense', wallet: null, amountIls: 30, category: 'מזון וצריכה', note: 'חלב', spentAt: `${MONTH}-11`, confidence: 'high' }],
    };
    await handleUpdate(textUpdate('30 חלב'));
    await handleUpdate(textUpdate('/undo'));
    expect(sql('select status from cash_spends')).toEqual([{ status: 'deleted' }]);
  });

  it('turns away a stranger in private and creates nothing', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(textUpdate('50 שקל', 999, { id: 999, type: 'private' }));
    expect(telegram.sent[0]?.text).toContain('פרטי');
    expect(sql('select id from household_members where telegram_user_id = 999')).toHaveLength(0);
  });

  it('answers /dashboard in the group privately, with a link and a working code', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    await handleUpdate(textUpdate('/dashboard', 111, { id: -500, type: 'group' }));

    const direct = telegram.sent.find((m) => m.chatId === 111)!;
    const inGroup = telegram.sent.find((m) => m.chatId === -500)!;
    expect(direct.text).toContain('/api/auth/telegram?t=');
    expect(inGroup.text).not.toContain('/api/auth');

    const code = /<code>(\d{6})<\/code>/.exec(direct.text)?.[1];
    const { POST } = await import('@/app/api/auth/code/route');
    const form = new FormData();
    form.set('code', code!);
    const response = await POST(new Request('https://our-money.test/api/auth/code', { method: 'POST', body: form }));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://our-money.test/dashboard');
    expect(response.headers.get('set-cookie')).toContain('om_session=');
  });

  it('settles a plan from the nudge button, once', async () => {
    const { handleUpdate } = await import('@/lib/telegram/handlers');
    signIn(member);
    const plan = await createPlan({
      kind: 'spend', amountIls: 800, category: 'ניקיון', note: 'עוזרת בית', envelopeId: `${MONTH}-fix`,
      dayOfMonth: 1, recurrence: 'monthly', startsMonth: MONTH, endsMonth: null, walletId: null, memberId: null,
    });
    if (!plan.ok) throw new Error(plan.error);

    const tap = (): TelegramUpdate => ({
      update_id: (updateId += 1),
      callback_query: {
        id: `cb-${updateId}`,
        from: { id: 111, is_bot: false, first_name: 'יצחק' },
        data: encodeCallback({ kind: 'settle_plan', spendId: plan.id, month: MONTH }),
        message: { message_id: 1, date: 0, chat: { id: 111, type: 'private' } },
      },
    }) as TelegramUpdate;

    await handleUpdate(tap());
    await handleUpdate(tap());
    expect(sql('select amount_ils, envelope_id from cash_spends')).toEqual([{ amount_ils: 800, envelope_id: `${MONTH}-fix` }]);
    expect(telegram.edits[0]).toContain('נרשם');
  });
});

describe('routes', () => {
  it('exports a Hebrew-safe CSV only to a signed-in member', async () => {
    const { GET } = await import('@/app/api/export/route');
    cookieJar.value = null;
    expect((await GET(new Request(`https://our-money.test/api/export?from=${MONTH}&to=${MONTH}`))).status).toBe(401);

    signIn(member);
    const response = await GET(new Request(`https://our-money.test/api/export?from=${MONTH}&to=${MONTH}`));
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('הראל ביטוח');
    // The ATM line is a withdrawal, not a charge: it is filtered from envelopes.
    expect(text.split('\r\n').filter((line) => line.includes('משיכת מזומן') && line.includes('הוצאה'))).toHaveLength(0);
  });

  it('keeps the nudge endpoint behind the cron secret, and messages whoever has not logged', async () => {
    const { GET } = await import('@/app/api/cron/evening-nudge/route');
    expect((await GET(new Request('https://our-money.test/api/cron/evening-nudge'))).status).toBe(401);

    const response = await GET(
      new Request('https://our-money.test/api/cron/evening-nudge', { headers: { authorization: 'Bearer integration-cron-secret' } }),
    );
    const body = (await response.json()) as { ok: boolean; sent: number };
    expect(body.ok).toBe(true);
    expect(body.sent).toBe(1);
    expect(telegram.sent[0]?.chatId).toBe(111);
  });
});
