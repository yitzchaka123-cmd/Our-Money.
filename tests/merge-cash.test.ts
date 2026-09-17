import { describe, expect, it } from 'vitest';

import { mergeCashIntoEnvelopes } from '@/lib/dashboard/data';
import type { NormalizedEnvelope } from '@/lib/riseup/envelopes';
import type { CashSpend } from '@/lib/types';

const names = new Map([['m1', 'יצחק']]);

function envelope(
  id: string,
  type: NormalizedEnvelope['type'],
  name: string,
  actuals: Partial<NormalizedEnvelope['actuals'][number]>[] = [],
): NormalizedEnvelope {
  const rows = actuals.map((a, i) => ({
    transactionId: `${id}-${i}`,
    transactionDate: '2026-09-03',
    billingDate: '2026-09-03',
    businessName: 'חנות',
    amountIls: 10,
    isIncome: false,
    accountNickname: null,
    accountNumberHash: null,
    source: null,
    isInstallment: false,
    paymentNumber: null,
    totalPayments: null,
    categoryLabel: null,
    ...a,
  }));
  return {
    envelopeId: id,
    type,
    name,
    plannedIls: 100,
    actualIls: rows.reduce((s, r) => s + r.amountIls, 0),
    position: 0,
    actuals: rows,
  };
}

function spend(overrides: Partial<CashSpend>): CashSpend {
  return {
    id: 'c1',
    member_id: 'm1',
    amount_ils: 40,
    category: 'סופר',
    note: 'מכולת',
    spent_at: '2026-09-15',
    status: 'confirmed',
    confidence: 'high',
    input_kind: 'voice',
    raw_input: null,
    transcript: null,
    telegram_update_id: null,
    telegram_chat_id: null,
    telegram_message_id: null,
    bot_message_id: null,
    envelope_id: null,
    envelope_type: null,
    created_at: '2026-09-15T10:00:00Z',
    ...overrides,
  };
}

describe('mergeCashIntoEnvelopes', () => {
  const month = [
    envelope('var', 'variable', 'הוצאות משתנות', [{ amountIls: 161.7 }]),
    envelope('fix', 'fixed', 'הוצאות קבועות', [{ amountIls: 74.8, categoryLabel: 'ביטוח' }]),
    envelope('t-super', 'trackingCategory', 'סופר', [{ amountIls: 74 }]),
  ];

  it('adds a cash spend to the tracker its category names, and to its total', () => {
    const merged = mergeCashIntoEnvelopes(month, [spend({ category: 'סופר' })], names);
    const superEnv = merged.find((e) => e.envelopeId === 't-super')!;
    expect(superEnv.actualIls).toBe(114);
    expect(superEnv.actuals.at(-1)?.cash).toMatchObject({ kind: 'spend', memberName: 'יצחק' });
    // Nothing leaked into the variable envelope.
    expect(merged.find((e) => e.envelopeId === 'var')?.actualIls).toBe(161.7);
  });

  it('honours an explicit envelope pin over the category name', () => {
    const merged = mergeCashIntoEnvelopes(
      month,
      [spend({ category: 'סופר', envelope_id: 'var' })],
      names,
    );
    expect(merged.find((e) => e.envelopeId === 'var')?.actualIls).toBe(201.7);
    expect(merged.find((e) => e.envelopeId === 't-super')?.actualIls).toBe(74);
  });

  it('ignores a pin to an envelope that no longer exists this month', () => {
    const merged = mergeCashIntoEnvelopes(
      month,
      [spend({ category: 'סופר', envelope_id: 'gone' })],
      names,
    );
    expect(merged.find((e) => e.envelopeId === 't-super')?.actualIls).toBe(114);
  });

  it('files an unknown category into variable, as RiseUp does', () => {
    const merged = mergeCashIntoEnvelopes(month, [spend({ category: 'מתנות' })], names);
    expect(merged.find((e) => e.envelopeId === 'var')?.actualIls).toBe(201.7);
  });

  it('does not mutate the envelopes it was given', () => {
    const before = month[2]!.actuals.length;
    mergeCashIntoEnvelopes(month, [spend({ category: 'סופר' })], names);
    expect(month[2]!.actuals.length).toBe(before);
  });

  it('stands up a variable envelope when nothing has been synced yet', () => {
    const merged = mergeCashIntoEnvelopes([], [spend({})], names);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ type: 'variable', actualIls: 40 });
  });
});
