import { describe, expect, it } from 'vitest';

import { parseAnswer, runs } from '@/lib/assistant/format';

describe('runs', () => {
  it('splits bold from plain text', () => {
    expect(runs('הוצאתם **208 ₪** על אוכל בחוץ.')).toEqual([
      { text: 'הוצאתם ', bold: false },
      { text: '208 ₪', bold: true },
      { text: ' על אוכל בחוץ.', bold: false },
    ]);
  });

  it('leaves an unmatched marker as it is', () => {
    expect(runs('**לא נסגר')).toEqual([{ text: '**לא נסגר', bold: false }]);
  });
});

describe('parseAnswer', () => {
  it('turns lines into paragraphs and lists', () => {
    const blocks = parseAnswer('בחודש הזה:\n\n- מזון: **900 ₪**\n• מסעדות: 300 ₪\n\nסה"כ **1,200 ₪**.');
    expect(blocks).toEqual([
      { kind: 'paragraph', runs: [{ text: 'בחודש הזה:', bold: false }] },
      {
        kind: 'list',
        items: [
          [
            { text: 'מזון: ', bold: false },
            { text: '900\u00a0₪', bold: true },
          ],
          [{ text: 'מסעדות: 300\u00a0₪', bold: false }],
        ],
      },
      {
        kind: 'paragraph',
        runs: [
          { text: 'סה"כ ', bold: false },
          { text: '1,200\u00a0₪', bold: true },
          { text: '.', bold: false },
        ],
      },
    ]);
  });

  it('keeps markup as text: nothing in an answer becomes HTML', () => {
    const blocks = parseAnswer('<img src=x onerror=alert(1)>');
    expect(blocks).toEqual([{ kind: 'paragraph', runs: [{ text: '<img src=x onerror=alert(1)>', bold: false }] }]);
  });

  it('keeps an amount and its shekel sign on one line', () => {
    expect(parseAnswer('נשארו 74 ₪')).toEqual([{ kind: 'paragraph', runs: [{ text: 'נשארו 74\u00a0₪', bold: false }] }]);
  });

  it('keeps the minus of a negative amount in front, but leaves "ו-120" alone', () => {
    expect(parseAnswer('התחזית: **-8,478 ₪**, ו-120 ₪ במזומן')[0]).toEqual({
      kind: 'paragraph',
      runs: [
        { text: 'התחזית: ', bold: false },
        { text: '\u200e-8,478\u00a0₪', bold: true },
        { text: ', ו-120\u00a0₪ במזומן', bold: false },
      ],
    });
  });

  it('reads a heading as a bold line', () => {
    expect(parseAnswer('## סיכום')).toEqual([{ kind: 'paragraph', runs: [{ text: 'סיכום', bold: true }] }]);
  });
});
