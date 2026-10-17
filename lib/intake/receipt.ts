import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import { hebrewWeekday, isoDateInIsrael } from '@/lib/dates';
import { env } from '@/lib/env';
import { loadBotEnvelopes } from '@/lib/intake/categories';
import { fileExpense, VARIABLE_NAME, type BotEnvelope } from '@/lib/intake/envelopes';
import { normalizeAmount, sanitizeDate, type ParsedEntry } from '@/lib/intake/parse';

/**
 * C25: a photo of a receipt, read by the AI into one cash expense — the same
 * shape a typed or spoken spend becomes, so the bot can treat it exactly the
 * same way. The image itself is never stored or logged: only what was read
 * from it.
 */

const MAX_TOKENS = 4000;

/** What Claude reads as an image; Telegram photos are always JPEG. */
export const RECEIPT_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ReceiptMediaType = (typeof RECEIPT_MEDIA_TYPES)[number];

export function isReceiptMediaType(value: string | undefined | null): value is ReceiptMediaType {
  return (RECEIPT_MEDIA_TYPES as readonly string[]).includes(value ?? '');
}

/** The biggest file the bot downloads at all. */
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
/** The API's per-image limit, measured on the base64 text (≈3.75 MB of image). */
export const MAX_AI_IMAGE_BASE64 = 5 * 1024 * 1024;

export const NOT_A_RECEIPT_REPLY =
  '🧾 לא הצלחתי לקרוא מהתמונה קבלה עם סכום. אפשר פשוט לכתוב לי, למשל <i>"80 בסופר"</i> — שום דבר לא נרשם.';
export const TOO_LARGE_REPLY =
  '🧾 התמונה גדולה מדי בשבילי. שלחו אותה כתמונה רגילה (לא כקובץ), או כתבו לי את הסכום — שום דבר לא נרשם.';
export const CARD_REPLY = [
  '💳 בקבלה כתוב שהתשלום היה בכרטיס — תשלומי כרטיס כבר מגיעים מרייזאפ, אז לא רשמתי כדי שזה לא ייספר פעמיים.',
  'שילמתם במזומן? שלחו שוב את התמונה עם הכיתוב <i>"מזומן"</i>.',
].join('\n');

export type ReceiptReading =
  | { kind: 'receipt'; entry: ParsedEntry; business: string | null }
  | { kind: 'not_receipt' | 'card' | 'too_large'; reply: string };

export interface ReceiptImage {
  data: ArrayBuffer | Uint8Array;
  mediaType: ReceiptMediaType;
}

export interface ReceiptOptions {
  /** Overrides the current date — used by tests. */
  today?: string;
  /** What they wrote with the photo: "מזומן", a note, a wallet. */
  caption?: string | null;
  speakerName?: string;
  /** Names of the household's cash wallets, so a caption can name one. */
  wallets?: string[];
  /** The envelopes to file into; loaded for the current month when absent. */
  envelopes?: BotEnvelope[];
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

/** Stable apart from the envelope list, so the cached prefix stays warm. */
export function buildReceiptPrompt(envelopes: BotEnvelope[], wallets: string[]): string {
  return [
    'You read photos of receipts for a married couple’s household cash bot in Israel. The photo was sent to log a purchase paid in cash.',
    '',
    'Rules:',
    '- is_receipt: true only when the image is a receipt, invoice or till slip with a total you can read. A photo of anything else (people, food, a screenshot of a chat, a product) is not a receipt.',
    '- total_ils: the total actually paid, in Israeli shekels, as a plain number. Prefer the line "סה"כ לתשלום", then "סה"כ" / "סך הכל" / "לתשלום" / "TOTAL". Never a subtotal before discounts, a VAT line (מע"מ), a single item, change given (עודף) or the amount tendered (שולם / מזומן שהתקבל). If you cannot read the total with reasonable certainty, use null.',
    '- business_name: the shop or business as printed at the top of the receipt (e.g. "שופרסל דיל", "קפה גרג"), without legal suffixes like בע"מ or a company number. null if not visible.',
    '- date: the purchase date printed on the receipt as YYYY-MM-DD (Israeli receipts print day/month/year). null when no date is visible.',
    '- note: a short description, no more than 60 characters: the business name, plus anything useful the caption adds (e.g. "שופרסל — קניות לשבת").',
    "- category MUST be exactly the name of one of the household's envelopes listed below. Supermarket and grocery receipts go to the supermarket envelope; restaurants, cafés and takeaway go to the eating-out envelope.",
    `- When no envelope fits, use "${VARIABLE_NAME}". Never invent a category.`,
    '- paid_by_card: true when the caption says it was paid by card ("אשראי", "כרטיס", "ויזה"), or the receipt itself clearly shows a card payment (card type, last four digits, "אשראי") and the caption does not say it was cash. Otherwise false.',
    '- confidence: "high" when the total and the business are clearly legible; "medium" when you inferred the envelope or the photo is a little unclear; "low" when you are unsure of the total itself (blurry, cut off, several candidate totals).',
    '- reply_note: always null.',
    '',
    'A caption, when present, is extra context from the person who sent the photo — for example "מזומן" or a note about what was bought. It never overrides a total that is clearly printed.',
    '',
    'Envelopes (use the exact name before the colon):',
    ...envelopes.map((e) => `- ${e.name}${e.hint ? `: ${e.hint}` : ''}`),
    '',
    wallets.length > 1
      ? `The household keeps cash in several wallets: ${wallets.join(' | ')}. If the caption says which wallet paid ("מהארנק של שרה"), set wallet to that exact name; otherwise null.`
      : 'wallet: always null.',
  ].join('\n');
}

function buildSchema(categories: string[], wallets: string[]) {
  return z.object({
    is_receipt: z.boolean(),
    total_ils: z.number().positive().nullable(),
    business_name: z.string().nullable(),
    date: z.string().nullable(),
    category: z.enum(categories as [string, ...string[]]),
    note: z.string(),
    paid_by_card: z.boolean(),
    confidence: z.enum(['high', 'medium', 'low']),
    wallet: wallets.length > 1 ? z.enum(wallets as [string, ...string[]]).nullable() : z.null(),
    reply_note: z.string().nullable(),
  });
}

/** The caption says cash in so many words — that beats what the slip seems to show. */
const SAYS_CASH = /מזומן|במזומנים|\bcash\b/i;

function toBase64(data: ArrayBuffer | Uint8Array): string {
  return Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data)).toString('base64');
}

export async function readReceipt(image: ReceiptImage, options: ReceiptOptions = {}): Promise<ReceiptReading> {
  const base64 = toBase64(image.data);
  if (base64.length > MAX_AI_IMAGE_BASE64) return { kind: 'too_large', reply: TOO_LARGE_REPLY };

  const today = options.today ?? isoDateInIsrael();
  const envelopes = options.envelopes ?? (await loadBotEnvelopes(today.slice(0, 7)));
  const wallets = options.wallets ?? [];
  const caption = options.caption?.trim() || null;

  const response = await anthropic().messages.parse({
    model: env.aiModel,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: buildReceiptPrompt(envelopes, wallets), cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: base64 } },
          {
            type: 'text',
            text: [
              `Current date: ${today} (${hebrewWeekday(today)})`,
              options.speakerName ? `Sent by: ${options.speakerName}` : null,
              caption ? `Caption: ${caption}` : 'No caption.',
            ]
              .filter((line) => line !== null)
              .join('\n'),
          },
        ],
      },
    ],
    output_config: {
      effort: env.intakeEffort,
      format: zodOutputFormat(buildSchema(envelopes.map((e) => e.name), wallets)),
    },
  });

  const read = response.parsed_output;
  if (!read || !read.is_receipt || read.total_ils === null || !(read.total_ils > 0)) {
    return { kind: 'not_receipt', reply: NOT_A_RECEIPT_REPLY };
  }
  if (read.paid_by_card && !(caption && SAYS_CASH.test(caption))) {
    return { kind: 'card', reply: CARD_REPLY };
  }

  const business = read.business_name?.trim() || null;
  const printed = read.date ? sanitizeDate(read.date, today) : { date: today, adjusted: false };
  const note = (read.note.trim() || business || '').slice(0, 60);
  const words = [business, note, caption].filter(Boolean).join(' ');

  return {
    kind: 'receipt',
    business,
    entry: {
      direction: 'expense',
      wallet: read.wallet ?? null,
      amountIls: normalizeAmount(read.total_ils),
      // Only ever one of the household's envelopes; the business name is the safety net.
      category: fileExpense(read.category, words, envelopes).name,
      note,
      spentAt: printed.date,
      // A printed date we had to throw away is a sign the reading was shaky.
      confidence: printed.adjusted && read.confidence === 'high' ? 'medium' : read.confidence,
    },
  };
}
