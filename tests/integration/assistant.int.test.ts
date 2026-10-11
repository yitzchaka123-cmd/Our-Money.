import { beforeEach, describe, expect, it, vi } from 'vitest';

import { askAssistant, listAssistantChats, openAssistantChat } from '@/lib/assistant/actions';
import { MAX_CHATS_PER_MEMBER, createChat, pruneChats } from '@/lib/assistant/store';
import { currentMonth } from '@/lib/dashboard/data';

import { resetDb, seedMember, seedMonth, signIn, signOut, sql } from './helpers';

// The model is the one outside service here; it is never called for real.
const model = vi.hoisted(() => ({
  requests: [] as { system: { text: string }[]; messages: { role: string; content: unknown }[] }[],
  reply: 'הוצאתם **100 ₪** על אוכל בחוץ.',
}));
vi.mock('@/lib/assistant/client', () => ({
  assistantClient: () => ({
    beta: {
      messages: {
        create: async (params: (typeof model.requests)[number]) => {
          model.requests.push(structuredClone(params));
          return {
            content: [{ type: 'text', text: model.reply }],
            stop_reason: 'end_turn',
          };
        },
      },
    },
  }),
  failureMessage: () => 'נכשל',
}));

const MONTH = currentMonth();
let member: string;

beforeEach(async () => {
  resetDb();
  model.requests = [];
  member = await seedMember(111, 'יצחק');
  await seedMonth(MONTH);
  signIn(member);
});

describe('the assistant', () => {
  it('answers from the real numbers and keeps the chat, titled by its question', async () => {
    const result = await askAssistant(null, 'כמה הוצאנו על אוכל בחוץ החודש?');
    expect(result).toMatchObject({ ok: true, title: 'כמה הוצאנו על אוכל בחוץ החודש?', answer: model.reply });

    const data = model.requests[0]!.system[1]!.text;
    expect(data).toContain(`## החודש הנוכחי (${MONTH})`);
    expect(data).toContain('אוכל בחוץ');
    expect(data).toContain('## מזומן');

    const chats = sql(`select title from assistant_chats where member_id = '${member}'`);
    expect(chats).toEqual([{ title: 'כמה הוצאנו על אוכל בחוץ החודש?' }]);
    expect(sql('select role, content from assistant_messages order by id')).toEqual([
      { role: 'user', content: 'כמה הוצאנו על אוכל בחוץ החודש?' },
      { role: 'assistant', content: model.reply },
    ]);
  });

  it('continues a chat with its earlier turns, and lists and reopens it', async () => {
    const first = await askAssistant(null, 'כמה מזומן יש לנו?');
    if (!first.ok) throw new Error(first.error);
    await askAssistant(first.chatId, 'ואיפה הוא?');

    expect(model.requests[1]!.messages.map((m) => m.content)).toEqual(['כמה מזומן יש לנו?', model.reply, 'ואיפה הוא?']);

    const list = await listAssistantChats();
    expect(list.ok && list.chats.map((c) => c.title)).toEqual(['כמה מזומן יש לנו?']);
    const opened = await openAssistantChat(first.chatId);
    expect(opened.ok && opened.turns).toHaveLength(4);
  });

  it("never shows or continues another member's chat", async () => {
    const first = await askAssistant(null, 'שאלה פרטית');
    if (!first.ok) throw new Error(first.error);

    signIn(await seedMember(222, 'שרה'));
    expect((await listAssistantChats()).ok && (await listAssistantChats())).toMatchObject({ chats: [] });
    expect((await openAssistantChat(first.chatId)).ok).toBe(false);
    expect((await askAssistant(first.chatId, 'המשך')).ok).toBe(false);
    expect(sql('select count(*)::int as n from assistant_messages')[0]).toEqual({ n: 2 });
  });

  it('refuses without a session and does not call the model', async () => {
    signOut();
    expect((await askAssistant(null, 'שאלה')).ok).toBe(false);
    expect(model.requests).toHaveLength(0);
  });

  it(`keeps at most ${MAX_CHATS_PER_MEMBER} chats per member, dropping the oldest`, async () => {
    for (let i = 0; i < MAX_CHATS_PER_MEMBER + 3; i += 1) {
      await createChat(member, `שיחה ${i}`);
    }
    const left = sql<{ title: string }>(`select title from assistant_chats where member_id = '${member}' order by created_at`);
    expect(left).toHaveLength(MAX_CHATS_PER_MEMBER);
    expect(left[0]!.title).toBe('שיחה 3');
    expect(await pruneChats(member)).toBe(0);
  });

  it('keeps the chat tables locked like every other table', () => {
    const open = sql(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'money' and c.relname like 'assistant_%' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(open).toEqual([]);
    const grants = sql(`
      select table_name, grantee from information_schema.role_table_grants
      where table_schema = 'money' and table_name like 'assistant_%' and grantee in ('anon', 'authenticated', 'PUBLIC')`);
    expect(grants).toEqual([]);
  });
});
