import type { SyncState } from '@/lib/riseup/sync';

export interface SyncBanner {
  tone: 'error' | 'warning';
  text: string;
}

/** Past this, the numbers on screen are probably missing real card spending. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * What, if anything, the dashboard should warn about. Only problems that
 * change what the couple should do get a banner: a rate-limit blip that the
 * next sync will clear does not, until it has gone on long enough to leave the
 * data stale.
 */
export function syncBanner(state: SyncState, now = Date.now()): SyncBanner | null {
  if (state.lastFailure?.kind === 'auth') {
    return {
      tone: 'error',
      text: 'החיבור ל-RiseUp פג תוקף. צריך ליצור טוקן חדש ב-RiseUp ולעדכן אותו בהגדרות, ועד אז הנתונים לא מתעדכנים.',
    };
  }

  if (!state.lastSuccessAt) {
    return state.lastFailure
      ? { tone: 'error', text: 'עדיין לא הצלחנו למשוך נתונים מ-RiseUp. נסו לרענן בעוד כמה דקות.' }
      : null;
  }

  const age = now - Date.parse(state.lastSuccessAt);
  if (age > STALE_AFTER_MS) {
    const days = Math.floor(age / (24 * 60 * 60 * 1000));
    return {
      tone: 'warning',
      text:
        days <= 1
          ? 'הנתונים מ-RiseUp לא התעדכנו מאתמול. אפשר לרענן מהתפריט.'
          : `הנתונים מ-RiseUp לא התעדכנו כבר ${days} ימים. אפשר לרענן מהתפריט.`,
    };
  }

  return null;
}
