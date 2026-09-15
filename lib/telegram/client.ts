import { env } from '@/lib/env';
import type { InlineKeyboard, TelegramMessage } from '@/lib/telegram/types';

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
  keyboard?: InlineKeyboard,
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

interface TelegramFile {
  file_id: string;
  file_path?: string;
  file_size?: number;
}

/** Resolve a file_id to bytes. Two hops: getFile, then the file CDN. */
export async function downloadFile(fileId: string): Promise<ArrayBuffer> {
  const file = await call<TelegramFile>('getFile', { file_id: fileId });
  if (!file.file_path) throw new Error('Telegram returned no file_path for the voice note.');

  const response = await fetch(
    `https://api.telegram.org/file/bot${env.telegramBotToken}/${file.file_path}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to download voice note: HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

/** Escape text before interpolating it into an HTML-parse-mode message. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
