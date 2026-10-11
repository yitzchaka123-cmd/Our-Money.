import { describe, expect, it } from 'vitest';

import { syncFeedback } from '@/lib/riseup/sync-feedback';

describe('syncFeedback', () => {
  it('says it synced now after a real pull', () => {
    expect(syncFeedback({ ok: true, error: null, envelopes: 9 })).toEqual({ tone: 'ok', text: 'סונכרן עכשיו' });
  });

  it('says it is already current when a pull just finished', () => {
    const feedback = syncFeedback({ ok: true, error: null, envelopes: 0, skipped: 'fresh' });
    expect(feedback.tone).toBe('ok');
    expect(feedback.text).toContain('מעודכן');
  });

  it('says a pull is already running rather than pretending it finished', () => {
    const feedback = syncFeedback({ ok: true, error: null, envelopes: 0, skipped: 'running' });
    expect(feedback.tone).toBe('ok');
    expect(feedback.text).toContain('כבר רץ');
  });

  it('passes the reason through when it failed', () => {
    expect(syncFeedback({ ok: false, error: 'הטוקן של RiseUp פג תוקף.', envelopes: 0 })).toEqual({
      tone: 'error',
      text: 'הטוקן של RiseUp פג תוקף.',
    });
  });

  it('never shows an empty failure', () => {
    expect(syncFeedback({ ok: false, error: null, envelopes: 0 }).text.length).toBeGreaterThan(5);
  });
});
