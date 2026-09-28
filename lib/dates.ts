/**
 * Date helpers with no server dependencies, safe to import from client
 * components.
 */

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
