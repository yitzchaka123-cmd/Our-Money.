import { describe, expect, it } from 'vitest';

import { STALE_AFTER_MS, syncBanner } from '@/lib/riseup/banner';

const now = Date.parse('2026-09-28T12:00:00Z');
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

describe('syncBanner', () => {
  it('stays quiet when the last sync is recent', () => {
    expect(syncBanner({ lastSuccessAt: hoursAgo(1), lastFailure: null }, now)).toBeNull();
  });

  it('stays quiet over a rate-limit blip while the data is still fresh', () => {
    const banner = syncBanner(
      { lastSuccessAt: hoursAgo(2), lastFailure: { at: hoursAgo(1), kind: 'rate_limit', message: '' } },
      now,
    );
    expect(banner).toBeNull();
  });

  it('always shouts about an expired token, however fresh the data', () => {
    const banner = syncBanner(
      { lastSuccessAt: hoursAgo(1), lastFailure: { at: hoursAgo(0.5), kind: 'auth', message: '401' } },
      now,
    );
    expect(banner?.tone).toBe('error');
    expect(banner?.text).toContain('טוקן');
  });

  it('warns once the data is older than a day, with the day count', () => {
    expect(syncBanner({ lastSuccessAt: hoursAgo(30), lastFailure: null }, now)?.text).toContain('מאתמול');
    const banner = syncBanner({ lastSuccessAt: hoursAgo(24 * 3 + 1), lastFailure: null }, now);
    expect(banner?.tone).toBe('warning');
    expect(banner?.text).toContain('3 ימים');
  });

  it('explains a first sync that never succeeded', () => {
    const banner = syncBanner(
      { lastSuccessAt: null, lastFailure: { at: hoursAgo(0.1), kind: 'network', message: '' } },
      now,
    );
    expect(banner?.tone).toBe('error');
  });

  it('says nothing before any sync has run at all', () => {
    expect(syncBanner({ lastSuccessAt: null, lastFailure: null }, now)).toBeNull();
    expect(STALE_AFTER_MS).toBe(86_400_000);
  });
});
