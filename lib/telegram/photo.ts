import type { IntakeResult } from '@/lib/intake/parse';
import {
  isReceiptMediaType,
  MAX_RECEIPT_BYTES,
  readReceipt,
  TOO_LARGE_REPLY,
  type ReceiptMediaType,
} from '@/lib/intake/receipt';
import { downloadFile, TelegramFileTooLargeError } from '@/lib/telegram/client';
import type { TelegramMessage } from '@/lib/telegram/types';

/**
 * C25: a photo of a receipt sent to the bot, in private or in the family
 * group. This module only turns the photo into what a typed spend would have
 * been parsed into; the handlers save and reply exactly as they do for text
 * and voice. The image is never stored or logged — only the reading, plus the
 * Telegram file_id so the photo can be found in the chat again.
 */

export interface ReceiptFile {
  fileId: string;
  /** null: an image in a format the AI cannot read (e.g. HEIC sent as a file). */
  mediaType: ReceiptMediaType | null;
  fileSize: number | null;
}

/** The receipt image a message carries: the largest photo size, or an image sent as a file. */
export function receiptFileOf(message: TelegramMessage): ReceiptFile | null {
  if (message.photo?.length) {
    const largest = message.photo.reduce((best, size) =>
      size.width * size.height > best.width * best.height ? size : best,
    );
    return { fileId: largest.file_id, mediaType: 'image/jpeg', fileSize: largest.file_size ?? null };
  }
  const doc = message.document;
  if (doc?.mime_type?.startsWith('image/')) {
    return {
      fileId: doc.file_id,
      mediaType: isReceiptMediaType(doc.mime_type) ? doc.mime_type : null,
      fileSize: doc.file_size ?? null,
    };
  }
  return null;
}

/**
 * In a group, only a photo meant for the bot goes to the AI: one with a
 * caption (which covers an @mention) or one that replies to the bot. Plain
 * family photos are never read. In the private chat every photo is for the bot.
 */
export function photoMeantForBot(message: TelegramMessage): boolean {
  if (message.chat.type === 'private') return true;
  if (message.caption?.trim()) return true;
  return message.reply_to_message?.from?.is_bot === true;
}

/** What raw_input keeps for a receipt: what was read and where the photo is — never the image. */
export function receiptRawInput(fileId: string, business: string | null, caption: string | null): string {
  return ['[קבלה]', [business, caption?.slice(0, 100), `file:${fileId}`].filter(Boolean).join(' · ')].join(' ');
}

const UNSUPPORTED_REPLY =
  '🧾 את סוג הקובץ הזה אני לא יודע לקרוא. שלחו את הקבלה כתמונה רגילה (JPG או PNG), או כתבו לי את הסכום — שום דבר לא נרשם.';
const DOWNLOAD_FAILED_REPLY = '😕 לא הצלחתי להוריד את התמונה מטלגרם. נסו לשלוח שוב בעוד רגע — שום דבר לא נרשם.';
const READ_FAILED_REPLY = '😕 לא הצלחתי לקרוא את הקבלה כרגע. נסו לשלוח שוב בעוד רגע, או כתבו לי את הסכום — שום דבר לא נרשם.';

export type PhotoOutcome =
  | { kind: 'entry'; parsed: IntakeResult; rawInput: string }
  | { kind: 'reply'; text: string };

export interface ReadPhotoOptions {
  speakerName?: string;
  wallets?: string[];
  /** The bot's @username, stripped from the caption before the AI sees it. */
  botUsername?: string;
}

/** Download the receipt and read it; a reply instead when there is nothing to save. */
export async function readReceiptMessage(
  message: TelegramMessage,
  file: ReceiptFile,
  options: ReadPhotoOptions = {},
): Promise<PhotoOutcome> {
  if (!file.mediaType) return { kind: 'reply', text: UNSUPPORTED_REPLY };
  if (file.fileSize !== null && file.fileSize > MAX_RECEIPT_BYTES) return { kind: 'reply', text: TOO_LARGE_REPLY };

  let data: ArrayBuffer;
  try {
    data = await downloadFile(file.fileId, { maxBytes: MAX_RECEIPT_BYTES });
  } catch (error) {
    if (error instanceof TelegramFileTooLargeError) return { kind: 'reply', text: TOO_LARGE_REPLY };
    // The error, never the image: nothing about the photo goes to the logs.
    console.error('Receipt download failed', error instanceof Error ? error.message : error);
    return { kind: 'reply', text: DOWNLOAD_FAILED_REPLY };
  }

  const mention = options.botUsername ? `@${options.botUsername}` : null;
  const caption = (mention ? (message.caption ?? '').split(mention).join(' ') : (message.caption ?? '')).trim() || null;

  let reading;
  try {
    reading = await readReceipt({ data, mediaType: file.mediaType }, { caption, speakerName: options.speakerName, wallets: options.wallets });
  } catch (error) {
    console.error('Receipt reading failed', error instanceof Error ? error.message : error);
    return { kind: 'reply', text: READ_FAILED_REPLY };
  }

  if (reading.kind !== 'receipt') return { kind: 'reply', text: reading.reply };
  return {
    kind: 'entry',
    parsed: { intent: 'log_expense', entries: [reading.entry], replyNote: null },
    rawInput: receiptRawInput(file.fileId, reading.business, caption),
  };
}
