import { env } from '@/lib/env';
import type { InlineKeyboard, LinkKeyboard, TelegramMessage } from '@/lib/telegram/types';

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${env.telegramBotToken}/${method}`;
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(apiUrl(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as {
    ok: boolean;
    result?: T;
    description?: string;
  };

  if (!payload.ok) {
    throw new Error(`Telegram ${method} failed: ${payload.description ?? response.status}`);
  }
  return payload.result as T;
}

export async function sendMessage(
  chatId: number,
  text: string,
  keyboard?: InlineKeyboard | LinkKeyboard,
): Promise<TelegramMessage> {
  return call<TelegramMessage>('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    // Link previews in an expense log are pure noise.
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  await call('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

/** The little "typing…" indicator, so a slow transcription does not feel dead. */
export async function sendTyping(chatId: number): Promise<void> {
  try {
    await call('sendChatAction', { chat_id: chatId, action: 'typing' });
  } catch {
    // Purely cosmetic — never let this break an actual save.
  }
}

export async function answerCallbackQuery(id: string, text?: string): Promise<void> {
  try {
    await call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) });
  } catch {
    // Telegram rejects answers to callbacks older than ~15 minutes; harmless.
  }
}

export interface TelegramFile {
  file_id: string;
  file_path?: string;
  file_size?: number;
}

/** A file bigger than the caller is willing to download. Nothing was fetched. */
export class TelegramFileTooLargeError extends Error {
  constructor(readonly size: number, readonly maxBytes: number) {
    super(`Telegram file is ${size} bytes, over the ${maxBytes}-byte limit.`);
    this.name = 'TelegramFileTooLargeError';
  }
}

export async function getFile(fileId: string): Promise<TelegramFile> {
  return call<TelegramFile>('getFile', { file_id: fileId });
}

/**
 * Resolve a file_id to bytes. Two hops: getFile, then the file CDN. With
 * `maxBytes`, a file Telegram reports as bigger is never downloaded, and one
 * that turns out bigger is dropped.
 */
export async function downloadFile(fileId: string, options: { maxBytes?: number } = {}): Promise<ArrayBuffer> {
  const file = await getFile(fileId);
  if (!file.file_path) throw new Error('Telegram returned no file_path for the file.');
  const { maxBytes } = options;
  if (maxBytes !== undefined && file.file_size !== undefined && file.file_size > maxBytes) {
    throw new TelegramFileTooLargeError(file.file_size, maxBytes);
  }

  const response = await fetch(
    `https://api.telegram.org/file/bot${env.telegramBotToken}/${file.file_path}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to download the file: HTTP ${response.status}`);
  }
  const data = await response.arrayBuffer();
  if (maxBytes !== undefined && data.byteLength > maxBytes) {
    throw new TelegramFileTooLargeError(data.byteLength, maxBytes);
  }
  return data;
}

export async function getMe(): Promise<{ id: number; username?: string; first_name: string }> {
  return call('getMe', {});
}

/** Leave a group the bot was added to by someone outside the household. */
export async function leaveChat(chatId: number): Promise<void> {
  try {
    await call('leaveChat', { chat_id: chatId });
  } catch (error) {
    console.error('Could not leave the chat', error);
  }
}

/**
 * The updates the webhook asks for. my_chat_member tells the bot it was
 * added to (or removed from) a group, so it can remember the family group
 * by itself.
 */
export const ALLOWED_UPDATES = ['message', 'callback_query', 'my_chat_member'] as const;

export interface WebhookInfo {
  url: string;
  pending_update_count: number;
  allowed_updates?: string[];
  last_error_date?: number;
  last_error_message?: string;
}

export function webhookUrl(): string {
  return `${env.appBaseUrl}/api/telegram/webhook`;
}

/**
 * Point Telegram at this deployment, with the current secret. Without `force`
 * it only acts when the URL is wrong or Telegram reports our endpoint
 * rejecting it (a changed secret); with it, it always re-registers. Pending
 * messages are kept either way.
 */
export async function ensureWebhook(force = false): Promise<{ changed: boolean; info: WebhookInfo }> {
  const info = await call<WebhookInfo>('getWebhookInfo', {});
  const rejected = /401|403|Unauthorized|Forbidden/i.test(info.last_error_message ?? '');
  // Registered before group setup existed: ask for the membership updates too.
  const missingUpdates = Boolean(info.allowed_updates && ALLOWED_UPDATES.some((u) => !info.allowed_updates!.includes(u)));
  if (!force && info.url === webhookUrl() && !rejected && !missingUpdates) return { changed: false, info };

  await call('setWebhook', {
    url: webhookUrl(),
    secret_token: env.telegramWebhookSecret,
    allowed_updates: ALLOWED_UPDATES,
  });
  return { changed: true, info: await call<WebhookInfo>('getWebhookInfo', {}) };
}

/** Escape text before interpolating it into an HTML-parse-mode message. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
