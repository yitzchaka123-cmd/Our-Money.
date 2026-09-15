/** Money and date rendering shared by the bot and the dashboard. */

export function formatIls(amount: number): string {
  return `₪${amount.toLocaleString('he-IL', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Compact form for stat tiles and hero figures, where digits are large. */
export function formatIlsCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1000) {
    const thousands = amount / 1000;
    const digits = Math.abs(thousands) >= 100 ? 0 : 1;
    return `₪${thousands.toFixed(digits).replace(/\.0$/, '')}K`;
  }
  return formatIls(amount);
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

/** Relative day label, so "היום" reads naturally instead of a bare date. */
export function friendlyDate(iso: string, today: string): string {
  if (iso === today) return 'היום';

  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`);
  if (diff === dayMs) return 'אתמול';
  if (diff === 2 * dayMs) return 'שלשום';
  return formatDate(iso);
}

const MONTH_NAMES = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export function monthLabel(month: string): string {
  const [year, monthPart] = month.split('-');
  const name = MONTH_NAMES[Number(monthPart) - 1] ?? month;
  return `${name} ${year}`;
}
