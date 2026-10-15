/**
 * The always-visible line under the top bar (feedback video 2, item 15):
 * when RiseUp was last pulled successfully, in words — "עודכן לפני 5 דק׳",
 * "עודכן היום 20:40". Pure, so the client can re-run it every half minute.
 */

const ZONE = 'Asia/Jerusalem';

function israelParts(date: Date): { day: string; time: string; dm: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
    dm: `${get('day')}.${get('month')}`,
  };
}

export function syncedAgoLabel(iso: string | null, now: Date = new Date()): string {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return 'עוד לא סונכרן מרייזאפ';

  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return 'עודכן עכשיו';
  if (minutes === 1) return 'עודכן לפני דקה';
  if (minutes < 60) return `עודכן לפני ${minutes} דק׳`;

  const then = israelParts(at);
  if (then.day === israelParts(now).day) return `עודכן היום ${then.time}`;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (then.day === israelParts(yesterday).day) return `עודכן אתמול ${then.time}`;
  return `עודכן ${then.dm} ${then.time}`;
}
