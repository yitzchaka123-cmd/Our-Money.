/**
 * CSV that Excel opens correctly in Hebrew: a UTF-8 byte-order mark (without
 * it Excel guesses a legacy code page and the text turns to gibberish), CRLF
 * line ends, and RFC 4180 quoting.
 */
export const BOM = '﻿';

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'number' ? String(value) : value;
  // A leading =, +, - or @ makes Excel evaluate the cell as a formula. Merchant
  // names come from outside, so neutralise that rather than trust them.
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value !== 'number' ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return BOM + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
