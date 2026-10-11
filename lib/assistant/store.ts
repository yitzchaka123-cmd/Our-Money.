import { db } from '@/lib/db/client';
import type { ChatTurn } from '@/lib/assistant/prompt';

/**
 * The assistant's chats, one member at a time: every read and write names
 * the member, so a chat id from someone else finds nothing.
 */

/** Chats kept per member; older ones are deleted when a new one starts. */
export const MAX_CHATS_PER_MEMBER = 20;

const MAX_CONTENT = 8000;

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export async function listChats(memberId: string): Promise<ChatSummary[]> {
  const { data, error } = await db()
    .from('assistant_chats')
    .select('id, title, updated_at')
    .eq('member_id', memberId)
    .order('updated_at', { ascending: false })
    .limit(MAX_CHATS_PER_MEMBER);
  if (error) throw new Error(`Listing chats failed: ${error.message}`);
  return ((data ?? []) as { id: string; title: string; updated_at: string }[]).map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updated_at,
  }));
}

/** A chat's turns, oldest first, or null when it is not this member's. */
export async function loadChat(memberId: string, chatId: string): Promise<ChatTurn[] | null> {
  if (!isUuid(chatId)) return null;
  const supabase = db();
  const { data: chat } = await supabase
    .from('assistant_chats')
    .select('id')
    .eq('id', chatId)
    .eq('member_id', memberId)
    .maybeSingle();
  if (!chat) return null;

  const { data, error } = await supabase
    .from('assistant_messages')
    .select('role, content')
    .eq('chat_id', chatId)
    .order('id', { ascending: true });
  if (error) throw new Error(`Loading a chat failed: ${error.message}`);
  return (data ?? []) as ChatTurn[];
}

export async function createChat(memberId: string, title: string): Promise<string> {
  const { data, error } = await db()
    .from('assistant_chats')
    .insert({ member_id: memberId, title })
    .select('id')
    .single();
  if (error) throw new Error(`Starting a chat failed: ${error.message}`);
  await pruneChats(memberId);
  return data.id as string;
}

/** Add a question and its answer, and move the chat to the top of the list. */
export async function appendTurns(chatId: string, turns: ChatTurn[]): Promise<void> {
  const supabase = db();
  const { error } = await supabase
    .from('assistant_messages')
    .insert(turns.map((t) => ({ chat_id: chatId, role: t.role, content: t.content.slice(0, MAX_CONTENT) })));
  if (error) throw new Error(`Saving the chat failed: ${error.message}`);
  await supabase.from('assistant_chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
}

/** Keep the member's newest chats; their messages go with them. */
export async function pruneChats(memberId: string, keep = MAX_CHATS_PER_MEMBER): Promise<number> {
  const supabase = db();
  const { data, error } = await supabase
    .from('assistant_chats')
    .select('id')
    .eq('member_id', memberId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .range(keep, keep + 200);
  if (error) throw new Error(`Pruning chats failed: ${error.message}`);
  const old = ((data ?? []) as { id: string }[]).map((c) => c.id);
  if (old.length === 0) return 0;
  await supabase.from('assistant_chats').delete().eq('member_id', memberId).in('id', old);
  return old.length;
}

/** Questions this member asked since `since` — a brake on runaway use. */
export async function questionsSince(memberId: string, since: string): Promise<number> {
  const supabase = db();
  const { data: chats } = await supabase
    .from('assistant_chats')
    .select('id')
    .eq('member_id', memberId)
    .gte('updated_at', since);
  const ids = ((chats ?? []) as { id: string }[]).map((c) => c.id);
  if (ids.length === 0) return 0;
  const { count } = await supabase
    .from('assistant_messages')
    .select('id', { count: 'exact', head: true })
    .in('chat_id', ids)
    .eq('role', 'user')
    .gte('created_at', since);
  return count ?? 0;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
