import { describe, expect, it } from 'vitest';

import { hebrewWeekday, isoDateInIsrael, normalizeAmount, sanitizeDate } from '@/lib/intake/parse';
import { recentMonths } from '@/lib/riseup/client';

describe('sanitizeDate', () => {
  const today = '2026-09-15';

  it('accepts a valid recent date', () => {
    expect(sanitizeDate('2026-09-10', today)).toEqual({ date: '2026-09-10', adjusted: false });
  });

  it('accepts today itself', () => {
    expect(sanitizeDate(today, today)).toEqual({ date: today, adjusted: false });
  });

  it('pulls a future date back to today', () => {
    // A model that resolves "ראשון" to the coming Sunday would otherwise put
    // cash spending in the future and skew every month report.
    expect(sanitizeDate('2026-09-20', today)).toEqual({ date: today, adjusted: true });
  });

  it('rejects a date more than a year old', () => {
    expect(sanitizeDate('2024-01-01', today)).toEqual({ date: today, adjusted: true });
  });

  it('rejects a malformed date', () => {
    expect(sanitizeDate('yesterday', today)).toEqual({ date: today, adjusted: true });
    expect(sanitizeDate('2026-13-45', today)).toEqual({ date: today, adjusted: true });
  });
});

describe('normalizeAmount', () => {
  it('rounds to agorot', () => {
    expect(normalizeAmount(12.345)).toBe(12.35);
    expect(normalizeAmount(0.1 + 0.2)).toBe(0.3);
  });

  it('leaves whole shekels alone', () => {
    expect(normalizeAmount(80)).toBe(80);
  });
});

describe('isoDateInIsrael', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(isoDateInIsrael()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses Israel time, not UTC', () => {
    // 22:30 UTC on the 14th is already the 15th in Jerusalem — getting this
    // wrong would file late-evening expenses under the previous day.
    const lateEvening = new Date('2026-09-14T22:30:00Z');
    expect(isoDateInIsrael(lateEvening)).toBe('2026-09-15');
  });
});

describe('recentMonths', () => {
  it('walks backwards from the current month', () => {
    expect(recentMonths(3, new Date('2026-09-15T00:00:00Z'))).toEqual([
      '2026-09',
      '2026-08',
      '2026-07',
    ]);
  });

  it('crosses a year boundary', () => {
    expect(recentMonths(3, new Date('2026-01-10T00:00:00Z'))).toEqual([
      '2026-01',
      '2025-12',
      '2025-11',
    ]);
  });
});

describe('hebrewWeekday', () => {
  it('names the weekday of the supplied date, not of today', () => {
    // 2026-09-15 is a Tuesday. Deriving this from the wall clock instead would
    // hand the model a weekday that contradicts the date it was given.
    expect(hebrewWeekday('2026-09-15')).toBe('יום שלישי');
  });

  it('does not slip a day across the UTC boundary', () => {
    expect(hebrewWeekday('2026-09-14')).toBe('יום שני');
  });
});
