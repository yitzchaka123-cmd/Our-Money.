import { describe, expect, it } from 'vitest';

import {
  businessQuestionText,
  isSkipAnswer,
  pickNewBusinessCharges,
  type ChargeRow,
} from '@/lib/telegram/business-question';

function row(id: string, business: string, extra: Partial<ChargeRow> = {}): ChargeRow {
  return {
    transaction_id: id,
    transaction_date: '2026-10-15',
    first_seen_at: '2026-10-16T05:00:00Z',
    cashflow_month: '2026-10',
    business_name: business,
    amount_ils: 89.9,
    is_income: false,
    is_withdrawal: false,
    source: 'isracard',
    account_number_hash: 'h1',
    account_nickname: null,
    ...extra,
  };
}

describe('C26: which new charges get "מה קניתם כאן?"', () => {
  it('asks about a business never seen before, once per business, oldest first', () => {
    const picked = pickNewBusinessCharges({
      recent: [
        row('b', 'דל פסטו', { transaction_date: '2026-10-15' }),
        row('a', 'דל פסטו', { transaction_date: '2026-10-14' }),
        row('c', 'פיצה האט', { transaction_date: '2026-10-13' }),
      ],
      knownBusinesses: new Set(),
      skip: new Set(),
    });
    expect(picked.map((c) => c.transaction_id)).toEqual(['c', 'a']);
  });

  it('skips a business that appeared before, whatever its spacing or case', () => {
    const picked = pickNewBusinessCharges({
      recent: [row('a', '  Wolt  Tel Aviv'), row('b', 'שופרסל דיל')],
      knownBusinesses: new Set(['wolt tel aviv']),
      skip: new Set(),
    });
    expect(picked.map((c) => c.transaction_id)).toEqual(['b']);
  });

  it('never asks about income, withdrawals, refunds or a nameless charge', () => {
    const picked = pickNewBusinessCharges({
      recent: [
        row('inc', 'משכורת', { is_income: true }),
        row('atm', 'כספומט', { is_withdrawal: true }),
        row('atm2', 'משיכת מזומן'),
        row('refund', 'זארה', { amount_ils: -120 }),
        row('blank', '   '),
      ],
      knownBusinesses: new Set(),
      skip: new Set(),
    });
    expect(picked).toEqual([]);
  });

  it('stays quiet about a business once its first charge was asked about or has a note', () => {
    const picked = pickNewBusinessCharges({
      recent: [
        row('asked', 'דל פסטו', { transaction_date: '2026-10-14' }),
        row('later', 'דל פסטו', { transaction_date: '2026-10-15' }),
        row('noted', 'פיצה האט'),
      ],
      knownBusinesses: new Set(),
      skip: new Set(['asked', 'noted']),
    });
    expect(picked).toEqual([]);
  });

  it('asks at most five at a time', () => {
    const recent = Array.from({ length: 8 }, (_, i) => row(`t${i}`, `עסק ${i}`));
    expect(pickNewBusinessCharges({ recent, knownBusinesses: new Set(), skip: new Set() })).toHaveLength(5);
  });
});

describe('C26: the question', () => {
  it('says the amount, the business, the date and the card', () => {
    expect(businessQuestionText(row('a', 'דל פסטו'), 'הכרטיס של שרה')).toBe(
      '🛍 חיוב חדש: <b>₪89.90</b> ב-דל פסטו (15.10, הכרטיס של שרה). מה קניתם? אפשר לענות בהודעה (או ״דלג״).',
    );
  });

  it('leaves the card out when it has no name, and escapes the business', () => {
    expect(businessQuestionText(row('a', 'A<B'), null)).toBe(
      '🛍 חיוב חדש: <b>₪89.90</b> ב-A&lt;B (15.10). מה קניתם? אפשר לענות בהודעה (או ״דלג״).',
    );
  });

  it('knows a skip when it sees one', () => {
    expect(isSkipAnswer('דלג')).toBe(true);
    expect(isSkipAnswer(' דלג. ')).toBe(true);
    expect(isSkipAnswer('-')).toBe(true);
    expect(isSkipAnswer('שניצל')).toBe(false);
  });
});
