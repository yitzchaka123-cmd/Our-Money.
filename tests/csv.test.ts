import { describe, expect, it } from 'vitest';

import { BOM, csvCell, toCsv } from '@/lib/export/csv';

describe('csv', () => {
  it('starts with a byte-order mark so Excel reads Hebrew as UTF-8', () => {
    expect(toCsv([['שלום']]).startsWith(BOM)).toBe(true);
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('defuses text Excel would run as a formula, but not negative numbers', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+972')).toBe("'+972");
    expect(csvCell(-12.5)).toBe('-12.5');
  });

  it('writes empty cells for missing values and CRLF between rows', () => {
    expect(toCsv([['a', null, 3], ['b', undefined, 4]])).toBe(`${BOM}a,,3\r\nb,,4\r\n`);
  });
});
