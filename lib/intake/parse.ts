import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import { env } from '@/lib/env';
import { activeCategories, CATCH_ALL_CATEGORY } from '@/lib/intake/categories';
import type { Confidence } from '@/lib/types';

const MODEL = 'claude-opus-5';

/**
 * Short messages with a tiny schema — 4k leaves generous room for adaptive
 * thinking without ever being the reason a parse gets truncated.
 */
const MAX_TOKENS = 4000;

export interface ParsedEntry {
  direction: 'expense' | 'income';
  /** A wallet name from the household's list, when the message named one. */
  wallet: string | null;
  amountIls: number;
  category: string;
  note: string;
  spentAt: string;
  confidence: Confidence;
}

export interface IntakeResult {
  intent: 'log_expense' | 'question' | 'unclear';
  entries: ParsedEntry[];
  /** Hebrew sentence to send back when nothing could be logged. */
  replyNote: string | null;
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

/**
 * The system prompt is deliberately stable: the category list is the only part
 * that ever changes, and it changes rarely. That keeps the cached prefix warm
 * across the dozens of short calls a day this bot makes.
 */
function buildSystemPrompt(categories: string[], wallets: string[]): string {
  return [
    'You extract cash movements — money spent in cash, and cash received — from short messages sent by a married couple to their household cash bot.',
    'They write in Hebrew, English, or a mix, casually, often mid-errand. Voice notes arrive as transcripts, so expect filler words, false starts, and transcription noise.',
    '',
    'Your job: turn the message into zero or more entries, each an expense or an income.',
    '',
    'Rules:',
    '- All amounts are Israeli shekels (ILS). Numbers may be written as digits ("50", "50 ש\\"ח", "₪50") or words ("חמישים שקל", "fifty shekels"). Convert to a plain number.',
    '- One message may contain several expenses ("80 על סופר ו-30 על קפה") — emit one entry per expense.',
    '- Resolve relative dates against the supplied current date: היום/today, אתמול/yesterday, שלשום = two days ago, "ביום ראשון" = the most recent past Sunday. Never return a future date. Default to the current date when no date is mentioned.',
    '- spent_at must be YYYY-MM-DD.',
    '- note: a short, human description of what was bought, in the language the user used. Keep the merchant name if one was given. No more than 60 characters.',
    '- category MUST be exactly one of the allowed categories listed below. Pick the closest fit; use the catch-all only when nothing fits.',
    '- confidence reflects how sure you are about the amount and category together: "high" when both are explicit, "medium" when you inferred the category, "low" when the amount itself was ambiguous.',
    '- direction: "expense" when cash was paid out. "income" when cash came IN — a cash salary, a gift ("קיבלתי 200 מסבתא"), a refund, something sold. Money withdrawn from an ATM is NOT income; it is already tracked, so ignore withdrawals entirely.',
    '- For an income entry, category is free text describing the source (e.g. "מתנה", "משכורת במזומן", "החזר") rather than one of the expense categories.',
    '',
    'Intent:',
    '- "log_expense" when the message reports cash spent or cash received. This is the common case.',
    '- "question" when they are asking about their spending rather than reporting it (e.g. "כמה הוצאנו החודש?"). Emit no entries.',
    '- "unclear" when you cannot find an amount, or the message is not about money. Emit no entries.',
    '',
    'reply_note: leave null when entries were produced. When intent is "question" or "unclear", write one short, warm Hebrew sentence saying what you need (for example: the amount). Never invent an amount to avoid asking.',
    '',
    'Only report expenses actually paid in cash context — this bot exists because card and bank spending is already tracked elsewhere. If the user explicitly says they paid by card ("בכרטיס", "באשראי"), set intent to "unclear" and explain in reply_note that card spending is tracked automatically.',
    '',
    `Allowed categories (use the exact string): ${categories.join(' | ')}`,
    `Catch-all category: ${CATCH_ALL_CATEGORY}`,
    '',
    wallets.length > 1
      ? `The household keeps cash in several wallets: ${wallets.join(' | ')}. If the message says which wallet the cash came from or went into ("מהארנק של שרה", "from the drawer"), set wallet to that exact name; otherwise null.`
      : 'wallet: always null.',
  ].join('\n');
}

function buildSchema(categories: string[], wallets: string[]) {
  const categoryEnum = z.enum(categories as [string, ...string[]]);
  const walletSchema =
    wallets.length > 1 ? z.enum(wallets as [string, ...string[]]).nullable() : z.null();

  return z.object({
    intent: z.enum(['log_expense', 'question', 'unclear']),
    entries: z.array(
      z.object({
        amount_ils: z.number().positive(),
        direction: z.enum(['expense', 'income']),
        // Expense categories are constrained; an income source is free text.
        category: z.union([categoryEnum, z.string()]),
        note: z.string(),
        spent_at: z.string(),
        confidence: z.enum(['high', 'medium', 'low']),
        wallet: walletSchema,
      }),
    ),
    reply_note: z.string().nullable(),
  });
}

/** ISO date for a Date, in the Israel timezone the couple actually lives in. */
export function isoDateInIsrael(now: Date = new Date()): string {
  // en-CA renders as YYYY-MM-DD, which is exactly the shape we store.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Weekday for an ISO date, so "ביום ראשון" resolves against the right week. */
export function hebrewWeekday(isoDate: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

/**
 * Guard against a hallucinated or mis-resolved date. A future date is always
 * wrong; anything older than a year is far likelier to be a model slip than a
 * real cash expense someone is only now remembering.
 */
export function sanitizeDate(candidate: string, today: string): { date: string; adjusted: boolean } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return { date: today, adjusted: true };

  const parsed = Date.parse(`${candidate}T00:00:00Z`);
  if (Number.isNaN(parsed)) return { date: today, adjusted: true };

  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;

  if (parsed > todayMs) return { date: today, adjusted: true };
  if (todayMs - parsed > oneYearMs) return { date: today, adjusted: true };

  return { date: candidate, adjusted: false };
}

/** Round to agorot. Floating point noise has no business in a ledger. */
export function normalizeAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export interface ParseOptions {
  /** Overrides the current date — used by tests and by back-dated imports. */
  today?: string;
  speakerName?: string;
  /** Names of the household's cash wallets, so a message can name one. */
  wallets?: string[];
}

export async function parseIntake(
  message: string,
  options: ParseOptions = {},
): Promise<IntakeResult> {
  const categories = await activeCategories();
  const today = options.today ?? isoDateInIsrael();
  const wallets = options.wallets ?? [];
  const schema = buildSchema(categories, wallets);

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: buildSystemPrompt(categories, wallets),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          `Current date: ${today} (${hebrewWeekday(today)})`,
          options.speakerName ? `Speaker: ${options.speakerName}` : null,
          '',
          'Message:',
          message,
        ]
          .filter((line) => line !== null)
          .join('\n'),
      },
    ],
    output_config: {
      effort: env.intakeEffort,
      format: zodOutputFormat(schema),
    },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    return {
      intent: 'unclear',
      entries: [],
      replyNote: 'לא הצלחתי להבין את ההודעה. אפשר לנסח שוב עם הסכום?',
    };
  }

  const entries: ParsedEntry[] = parsed.entries.map((entry) => {
    const { date, adjusted } = sanitizeDate(entry.spent_at, today);
    const isIncome = entry.direction === 'income';
    return {
      direction: entry.direction,
      wallet: entry.wallet ?? null,
      amountIls: normalizeAmount(entry.amount_ils),
      category: isIncome
        ? entry.category.trim() || 'הכנסה במזומן'
        : categories.includes(entry.category)
          ? entry.category
          : CATCH_ALL_CATEGORY,
      note: entry.note.slice(0, 60),
      spentAt: date,
      // A date we had to correct is a signal the parse was shaky overall.
      confidence: adjusted && entry.confidence === 'high' ? 'medium' : entry.confidence,
    };
  });

  return {
    intent: parsed.intent,
    entries,
    replyNote: parsed.reply_note,
  };
}
