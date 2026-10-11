/** What a manual "sync now" answered, as `refreshFromRiseup` returns it. */
export interface SyncOutcome {
  ok: boolean;
  error: string | null;
  envelopes: number;
  skipped?: 'fresh' | 'running';
}

export interface SyncFeedback {
  tone: 'ok' | 'error';
  text: string;
}

/** The short line shown after the top bar's sync button settles. */
export function syncFeedback(outcome: SyncOutcome): SyncFeedback {
  if (!outcome.ok) {
    return { tone: 'error', text: outcome.error || 'הסנכרון לא הצליח. נסו שוב עוד מעט.' };
  }
  if (outcome.skipped === 'running') return { tone: 'ok', text: 'סנכרון כבר רץ — עוד רגע זה יופיע' };
  if (outcome.skipped === 'fresh') return { tone: 'ok', text: 'כבר מעודכן — סונכרן לפני רגע' };
  return { tone: 'ok', text: 'סונכרן עכשיו' };
}
