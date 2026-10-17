import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EATING_OUT_KEY, SUPERMARKET_KEY, VARIABLE_NAME, type BotEnvelope } from '@/lib/intake/envelopes';
import type { TelegramMessage } from '@/lib/telegram/types';

/**
 * C25: a photo of a receipt in Telegram. The AI is always mocked — these
 * tests never call the real API.
 */

const ai = vi.hoisted(() => ({
  calls: [] as Array<{
    model: string;
    system: Array<{ text: string }>;
    messages: Array<{ role: string; content: Array<Record<string, unknown>> }>;
  }>,
  output: null as unknown,
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      parse: async (request: (typeof ai.calls)[number]) => {
        ai.calls.push(request);
        return { parsed_output: ai.output };
      },
    };
  },
}));

const envelopes: BotEnvelope[] = [
  { name: 'אוכל בחוץ', type: 'trackingCategory', envelopeId: 'e-out', key: EATING_OUT_KEY, hint: 'restaurants' },
  { name: 'סופר', type: 'trackingCategory', envelopeId: 'e-super', key: SUPERMARKET_KEY, hint: 'groceries' },
  { name: VARIABLE_NAME, type: 'variable', envelopeId: 'e-var', key: null, hint: 'catch-all' },
  { name: 'הוצאות קבועות', type: 'fixed', envelopeId: 'e-fix', key: null, hint: 'monthly' },
];

const TODAY = '2026-10-17';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function reading(over: Record<string, unknown> = {}) {
  return {
    is_receipt: true,
    total_ils: 182.4,
    business_name: 'שופרסל דיל',
    date: '2026-10-16',
    category: 'סופר',
    note: 'שופרסל דיל',
    paid_by_card: false,
    confidence: 'high',
    wallet: null,
    reply_note: null,
    ...over,
  };
}

beforeEach(() => {
  ai.calls = [];
  ai.output = null;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.AI_MODEL = 'model-from-the-environment';
});

describe('C25: reading a receipt photo', () => {
  it('sends the image as a base64 block to the model from AI_MODEL, with the envelopes', async () => {
    const { readReceipt } = await import('@/lib/intake/receipt');
    ai.output = reading();
    await readReceipt({ data: JPEG, mediaType: 'image/jpeg' }, { today: TODAY, envelopes });

    const call = ai.calls[0]!;
    expect(call.model).toBe('model-from-the-environment');
    const image = call.messages[0]!.content.find((b) => b.type === 'image')!;
    expect(image).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from(JPEG).toString('base64') },
    });
    const prompt = call.system[0]!.text;
    expect(prompt).toContain('- סופר: groceries');
    expect(prompt).toContain('סה"כ לתשלום');
  });

  it('turns a supermarket receipt into one expense in "סופר", with the business as the note', async () => {
    const { readReceipt } = await import('@/lib/intake/receipt');
    ai.output = reading();
    const result = await readReceipt({ data: JPEG, mediaType: 'image/jpeg' }, { today: TODAY, envelopes });

    expect(result.kind).toBe('receipt');
    if (result.kind !== 'receipt') return;
    expect(result.business).toBe('שופרסל דיל');
    expect(result.entry).toEqual({
      direction: 'expense',
      wallet: null,
      amountIls: 182.4,
      category: 'סופר',
      note: 'שופרסל דיל',
      spentAt: '2026-10-16',
      confidence: 'high',
    });
  });

  it('files a restaurant into "אוכל בחוץ" by its name even when the model said the catch-all', async () => {
    const { readReceipt } = await import('@/lib/intake/receipt');
    ai.output = reading({ business_name: 'פיצה האט', note: 'פיצה האט', category: VARIABLE_NAME, total_ils: 96 });
    const result = await readReceipt({ data: JPEG, mediaType: 'image/jpeg' }, { today: TODAY, envelopes });
    expect(result.kind === 'receipt' && result.entry.category).toBe('אוכל בחוץ');
  });

  it('anything else goes to "הוצאות משתנות", never an invented category', async () => {
    const { readReceipt } = await import('@/lib/intake/receipt');
    ai.output = reading({ business_name: 'חנות כלי בית', note: 'חנות כלי בית', category: 'אחר' });
    const result = await readReceipt({ data: JPEG, mediaType: 'image/jpeg' }, { today: TODAY, envelopes });
    expect(result.kind === 'receipt' && result.entry.category).toBe(VARIABLE_NAME);
  });

  it('defaults to today when the receipt shows no date, and never accepts a future one', async () => {
    const { readReceipt } = await import('@/lib/intake/receipt');
    ai.output = reading({ date: null });
    const undated = await readReceipt({ data: JPEG, mediaType: 'image/jpeg' }, { today: TODAY, envelopes });
    expect(undated.kind === 'receipt' && undated.entry).toMatchObject({ spentAt: TODAY, confidence: 'high' });

    ai.output = reading({ date: '2027-01-01' });
    const future = await readReceipt({ data: JPEG, mediaType: 'image/jpeg' }, { today: TODAY, envelopes });
    // A misread date is a sign the reading was shaky: it is not "high" any more.
    expect(future.kind === 'receipt' && future.entry).toMatchObject({ spentAt: TODAY, confidence: 'medium' });
  });

  it('keeps a low confidence low, so the bot always asks first', async () => {
    const { readReceipt } = await import('@/lib/intake/receipt');
    ai.output = reading({ confidence: 'low' });
    const result = await readReceipt({ data: JPEG, mediaType: 'image/jpeg' }, { today: TODAY, envelopes });
    expect(result.kind === 'receipt' && result.entry.confidence).toBe('low');
  });

  it('a photo that is not a receipt: a gentle ask to type the amount, nothing to save', async () => {
    const { readReceipt } = await import('@/lib/intake/receipt');
    ai.output = reading({ is_receipt: false, total_ils: null, business_name: null, reply_note: null });
    const result = await readReceipt({ data: JPEG, mediaType: 'image/jpeg' }, { today: TODAY, envelopes });
    expect(result.kind).toBe('not_receipt');
    if (result.kind === 'receipt') return;
    expect(result.reply).toContain('קבלה');
    expect(result.reply).toContain('לכתוב');
    expect(result.reply).toContain('שום דבר לא נרשם');
  });

  it('a receipt whose total cannot be read is treated the same way', async () => {
    const { readReceipt } = await import('@/lib/intake/receipt');
    ai.output = reading({ total_ils: null, confidence: 'low' });
    const result = await readReceipt({ data: JPEG, mediaType: 'image/jpeg' }, { today: TODAY, envelopes });
    expect(result.kind).toBe('not_receipt');
  });

  it('an empty answer from the model is treated as unreadable', async () => {
    const { readReceipt } = await import('@/lib/intake/receipt');
    ai.output = null;
    const result = await readReceipt({ data: JPEG, mediaType: 'image/jpeg' }, { today: TODAY, envelopes });
    expect(result.kind).toBe('not_receipt');
  });

  it('passes the caption to the model as extra context', async () => {
    const { readReceipt } = await import('@/lib/intake/receipt');
    ai.output = reading({ note: 'שופרסל — קניות לשבת' });
    await readReceipt({ data: JPEG, mediaType: 'image/jpeg' }, { today: TODAY, envelopes, caption: 'מזומן, קניות לשבת' });
    const text = ai.calls[0]!.messages[0]!.content.find((b) => b.type === 'text')!.text as string;
    expect(text).toContain('Caption: מזומן, קניות לשבת');
    expect(text).toContain(`Current date: ${TODAY}`);
  });

  it('a card payment is not logged as cash — unless the caption says it was cash', async () => {
    const { readReceipt } = await import('@/lib/intake/receipt');
    ai.output = reading({ paid_by_card: true });
    const card = await readReceipt({ data: JPEG, mediaType: 'image/jpeg' }, { today: TODAY, envelopes });
    expect(card.kind).toBe('card');
    if (card.kind !== 'receipt') expect(card.reply).toContain('מזומן');

    const cash = await readReceipt({ data: JPEG, mediaType: 'image/jpeg' }, { today: TODAY, envelopes, caption: 'מזומן' });
    expect(cash.kind).toBe('receipt');
  });

  it('an image too big for the AI is not sent at all', async () => {
    const { readReceipt, MAX_AI_IMAGE_BASE64 } = await import('@/lib/intake/receipt');
    const huge = new Uint8Array(Math.ceil((MAX_AI_IMAGE_BASE64 / 4) * 3) + 10);
    const result = await readReceipt({ data: huge, mediaType: 'image/png' }, { today: TODAY, envelopes });
    expect(result.kind).toBe('too_large');
    expect(ai.calls).toHaveLength(0);
  });

  it('a wallet named in the caption is passed through when there are several', async () => {
    const { readReceipt } = await import('@/lib/intake/receipt');
    ai.output = reading({ wallet: 'ארנק של שרה' });
    const result = await readReceipt(
      { data: JPEG, mediaType: 'image/jpeg' },
      { today: TODAY, envelopes, caption: 'מהארנק של שרה', wallets: ['ארנק משותף', 'ארנק של שרה'] },
    );
    expect(result.kind === 'receipt' && result.entry.wallet).toBe('ארנק של שרה');
  });
});

function photoMessage(over: Partial<TelegramMessage> = {}): TelegramMessage {
  return { message_id: 1, date: 0, chat: { id: 1, type: 'private' }, ...over };
}

describe('C25: which messages carry a receipt image', () => {
  it('takes the largest size of a photo', async () => {
    const { receiptFileOf } = await import('@/lib/telegram/photo');
    const message = photoMessage({
      photo: [
        { file_id: 'small', file_unique_id: 's', width: 90, height: 120, file_size: 2000 },
        { file_id: 'large', file_unique_id: 'l', width: 960, height: 1280, file_size: 180000 },
        { file_id: 'medium', file_unique_id: 'm', width: 320, height: 427, file_size: 25000 },
      ],
    });
    expect(receiptFileOf(message)).toEqual({ fileId: 'large', mediaType: 'image/jpeg', fileSize: 180000 });
  });

  it('accepts a JPEG, PNG or WebP sent as a file', async () => {
    const { receiptFileOf } = await import('@/lib/telegram/photo');
    for (const mime of ['image/jpeg', 'image/png', 'image/webp'] as const) {
      const message = photoMessage({ document: { file_id: `doc-${mime}`, file_unique_id: 'd', mime_type: mime, file_size: 3_000_000 } });
      expect(receiptFileOf(message)).toEqual({ fileId: `doc-${mime}`, mediaType: mime, fileSize: 3_000_000 });
    }
  });

  it('marks another image format as unsupported, and ignores files that are not images', async () => {
    const { receiptFileOf } = await import('@/lib/telegram/photo');
    expect(receiptFileOf(photoMessage({ document: { file_id: 'h', file_unique_id: 'h', mime_type: 'image/heic' } }))).toEqual({
      fileId: 'h',
      mediaType: null,
      fileSize: null,
    });
    expect(receiptFileOf(photoMessage({ document: { file_id: 'p', file_unique_id: 'p', mime_type: 'application/pdf' } }))).toBeNull();
    expect(receiptFileOf(photoMessage({ text: '80 בסופר' }))).toBeNull();
  });

  it('keeps only the file id and the reading in raw_input — never the image', async () => {
    const { receiptRawInput } = await import('@/lib/telegram/photo');
    expect(receiptRawInput('AgACfile', 'שופרסל דיל', 'מזומן')).toBe('[קבלה] שופרסל דיל · מזומן · file:AgACfile');
    expect(receiptRawInput('AgACfile', null, null)).toBe('[קבלה] file:AgACfile');
  });
});
