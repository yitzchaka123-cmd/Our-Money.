/**
 * The date column of a transaction row: "היום" and "אתמול" for the two most
 * recent days, so last night's purchase is easy to spot (feedback video 2,
 * item 16); otherwise RiseUp's own d.m.yy ("2.9.26").
 *
 * `today` is an ISO date in Israel (lib/dates.ts isoDateInIsrael).
 */
export function dayLabel(iso: string | null, today: string): string {
  if (!iso) return '';
  const day = iso.slice(0, 10);
  if (day === today) return 'היום';
  if (day === dayBefore(today)) return 'אתמול';
  const [year, month, date] = day.split('-');
  if (!year || !month || !date) return '';
  return `${Number(date)}.${Number(month)}.${year.slice(2)}`;
}

function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
