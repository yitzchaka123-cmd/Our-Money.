'use server';

import { SESSION_EXPIRED_MESSAGE, sessionMember } from '@/lib/auth/member';
import { assistantClient, failureMessage } from '@/lib/assistant/client';
import { loadAssistantContext, loadMonthText } from '@/lib/assistant/load';
import { askModel, chatTitle, cleanQuestion, type ChatTurn } from '@/lib/assistant/prompt';
import {
  appendTurns,
  createChat,
  listChats,
  loadChat,
  questionsSince,
  type ChatSummary,
} from '@/lib/assistant/store';

/**
 * The assistant sheet's server side. The model is called only from here, so
 * the API key stays on the server; every action checks the session and works
 * only on the signed-in member's own chats.
 */

/** Questions per member per hour before the assistant asks for a pause. */
const HOURLY_LIMIT = 40;

export type AskResult =
  | { ok: true; chatId: string; title: string; answer: string }
  | { ok: false; error: string };

export async function askAssistant(chatId: string | null, input: string): Promise<AskResult> {
  const memberId = await sessionMember();
  if (!memberId) return { ok: false, error: SESSION_EXPIRED_MESSAGE };

  const question = cleanQuestion(input);
  if (!question) return { ok: false, error: 'כתבו שאלה ואז שלחו.' };

  try {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    if ((await questionsSince(memberId, hourAgo)) >= HOURLY_LIMIT) {
      return { ok: false, error: 'הרבה שאלות בשעה האחרונה. נסו שוב קצת אחר כך.' };
    }

    let history: ChatTurn[] = [];
    if (chatId) {
      const turns = await loadChat(memberId, chatId);
      if (!turns) return { ok: false, error: 'השיחה הזו לא נמצאה. התחילו שיחה חדשה.' };
      history = turns;
    }

    const { context } = await loadAssistantContext(memberId);
    const answer = await askModel({
      client: assistantClient(),
      context,
      history,
      question,
      loadMonth: (month) => loadMonthText(month, memberId),
    });
    if (!answer.ok) return answer;

    const title = chatTitle(history.find((t) => t.role === 'user')?.content ?? question);
    const id = chatId ?? (await createChat(memberId, title));
    await appendTurns(id, [
      { role: 'user', content: question },
      { role: 'assistant', content: answer.text },
    ]);
    return { ok: true, chatId: id, title, answer: answer.text };
  } catch (error) {
    console.error('Assistant failed:', error instanceof Error ? error.message : error);
    return { ok: false, error: failureMessage(error) };
  }
}

export async function listAssistantChats(): Promise<
  { ok: true; chats: ChatSummary[] } | { ok: false; error: string }
> {
  const memberId = await sessionMember();
  if (!memberId) return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  try {
    return { ok: true, chats: await listChats(memberId) };
  } catch (error) {
    console.error(error);
    return { ok: false, error: 'לא הצלחנו לטעון את השיחות הקודמות.' };
  }
}

export async function openAssistantChat(
  chatId: string,
): Promise<{ ok: true; turns: ChatTurn[] } | { ok: false; error: string }> {
  const memberId = await sessionMember();
  if (!memberId) return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  try {
    const turns = await loadChat(memberId, String(chatId));
    return turns ? { ok: true, turns } : { ok: false, error: 'השיחה הזו לא נמצאה.' };
  } catch (error) {
    console.error(error);
    return { ok: false, error: 'לא הצלחנו לפתוח את השיחה.' };
  }
}
