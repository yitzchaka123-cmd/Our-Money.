import { db } from '@/lib/db/client';
import { env } from '@/lib/env';
import { getMe } from '@/lib/telegram/client';

/**
 * The family group (feedback video 3 #1, video 4 #3). The bot remembers it by
 * itself when someone in the household adds it to a group — no chat id to
 * copy into a server setting. TELEGRAM_GROUP_CHAT_ID, when set, still wins.
 *
 * Stored in money.app_settings (migration 0010). Before that migration is
 * applied, reads find nothing and the bot behaves as if there is no group.
 */

const GROUP_ID_KEY = 'telegram_group_chat_id';
const GROUP_TITLE_KEY = 'telegram_group_title';

/** The deep link payload; any short word works, Telegram passes it back to us. */
export const STARTGROUP_PAYLOAD = 'family';

export interface FamilyGroup {
  chatId: number;
  title: string | null;
  /** 'env': TELEGRAM_GROUP_CHAT_ID; 'bot': the group the bot was added to. */
  source: 'env' | 'bot';
}

export async function getFamilyGroup(): Promise<FamilyGroup | null> {
  const fromEnv = env.telegramGroupChatId;
  if (fromEnv !== null) return { chatId: fromEnv, title: null, source: 'env' };

  try {
    const { data, error } = await db()
      .from('app_settings')
      .select('key, value')
      .in('key', [GROUP_ID_KEY, GROUP_TITLE_KEY]);
    if (error) return null;
    const value = (key: string) => (data ?? []).find((r) => r.key === key)?.value as string | null | undefined;
    const chatId = Number(value(GROUP_ID_KEY));
    if (!value(GROUP_ID_KEY) || !Number.isFinite(chatId)) return null;
    return { chatId, title: value(GROUP_TITLE_KEY) ?? null, source: 'bot' };
  } catch {
    return null;
  }
}

/** Where household-wide messages go: the family group's id, or null for private messages. */
export async function familyGroupChatId(): Promise<number | null> {
  return (await getFamilyGroup())?.chatId ?? null;
}

/**
 * Remember this chat as the family group. Returns true only when that is
 * news — the bot hears about being added twice (the membership update and the
 * "joined" service message), and must greet the group once.
 */
export async function saveFamilyGroup(chatId: number, title: string | null, memberId: string): Promise<boolean> {
  const supabase = db();
  const value = String(chatId);
  const now = new Date().toISOString();

  // Change it only if it is different (row locks make two racing calls agree)…
  const { data: changed, error: updateError } = await supabase
    .from('app_settings')
    .update({ value, updated_by: memberId, updated_at: now })
    .eq('key', GROUP_ID_KEY)
    .neq('value', value)
    .select('key');
  if (updateError) throw new Error(`Failed to save the family group: ${updateError.message}`);

  let isNew = (changed ?? []).length > 0;
  if (!isNew) {
    // …or create it if there was none.
    const { data: inserted, error: insertError } = await supabase
      .from('app_settings')
      .upsert({ key: GROUP_ID_KEY, value, updated_by: memberId, updated_at: now }, { onConflict: 'key', ignoreDuplicates: true })
      .select('key');
    if (insertError) throw new Error(`Failed to save the family group: ${insertError.message}`);
    isNew = (inserted ?? []).length > 0;
  }

  const { error: titleError } = await supabase
    .from('app_settings')
    .upsert({ key: GROUP_TITLE_KEY, value: title?.slice(0, 200) ?? null, updated_by: memberId, updated_at: now }, { onConflict: 'key' });
  if (titleError) console.error('Could not save the group title', titleError.message);

  return isNew;
}

/** Forget the family group, but only if it is this chat (the bot was removed from it). */
export async function forgetFamilyGroup(chatId: number): Promise<boolean> {
  const { data, error } = await db()
    .from('app_settings')
    .delete()
    .eq('key', GROUP_ID_KEY)
    .eq('value', String(chatId))
    .select('key');
  if (error) {
    console.error('Could not forget the family group', error.message);
    return false;
  }
  if ((data ?? []).length > 0) {
    await db().from('app_settings').delete().eq('key', GROUP_TITLE_KEY);
    return true;
  }
  return false;
}

/** A group that became a supergroup gets a new id; follow it. */
export async function moveFamilyGroup(fromChatId: number, toChatId: number): Promise<void> {
  const { error } = await db()
    .from('app_settings')
    .update({ value: String(toChatId), updated_at: new Date().toISOString() })
    .eq('key', GROUP_ID_KEY)
    .eq('value', String(fromChatId));
  if (error) console.error('Could not follow the group to its new id', error.message);
}

let cachedBot: { id: number; username: string } | null = null;

/** The bot's own id and @username (asked once per instance). */
export async function botIdentity(): Promise<{ id: number; username: string } | null> {
  if (cachedBot) return cachedBot;
  try {
    const me = await getMe();
    cachedBot = { id: me.id, username: me.username ?? '' };
    return cachedBot;
  } catch (error) {
    console.error('Could not ask Telegram who the bot is', error);
    return null;
  }
}

/** "Add me to a group" — Telegram opens the group picker and adds the bot. */
export function addToGroupUrl(username: string): string {
  return `https://t.me/${username}?startgroup=${STARTGROUP_PAYLOAD}`;
}
