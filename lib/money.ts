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
  const { name, year } = monthParts(month);
  return year ? `${name} ${year}` : name;
}

/** Split so the name can be bold and the year regular, as RiseUp sets it. */
export function monthParts(month: string): { name: string; year: string } {
  const [year, monthPart] = month.split('-');
  return {
    name: MONTH_NAMES[Number(monthPart) - 1] ?? month,
    year: year ?? '',
  };
}

export interface AmountParts {
  /** "-" for negatives, empty otherwise. Rendered before the digits. */
  sign: string;
  /** Thousands-separated integer part, e.g. "16,114". */
  integer: string;
  /** Leading dot included, e.g. ".7". Empty when rendering without decimals. */
  decimal: string;
  currency: string;
}

/** Verified against the reference screenshots at 6x: RiseUp uses the ₪ sign. */
export const CURRENCY = '₪';

/**
 * RiseUp renders every amount as three runs at three sizes — big integer, small
 * decimal, medium currency — so amounts have to be split rather than formatted
 * into one string.
 *
 * Envelope and table values carry exactly one decimal place even when whole
 * (`0.0`, `500.0`); hero figures and prose totals are rounded to whole shekels.
 */
export function splitAmount(value: number, decimals: 0 | 1 = 1): AmountParts {
  const negative = value < 0;
  const magnitude = Math.abs(value);

  if (decimals === 0) {
    return {
      sign: negative ? '-' : '',
      integer: Math.round(magnitude).toLocaleString('en-US'),
      decimal: '',
      currency: CURRENCY,
    };
  }

  // Round first so 161.65 does not render as "161" + ".6".
  const rounded = Math.round(magnitude * 10) / 10;
  const integer = Math.floor(rounded);
  const tenths = Math.round((rounded - integer) * 10);

  return {
    sign: negative ? '-' : '',
    integer: integer.toLocaleString('en-US'),
    decimal: `.${tenths}`,
    currency: CURRENCY,
  };
}

/** Flat single-string form, for places that are not the three-run treatment. */
export function formatAmount(value: number, decimals: 0 | 1 = 1): string {
  const parts = splitAmount(value, decimals);
  return `${parts.sign}${parts.integer}${parts.decimal} ${parts.currency}`;
}
