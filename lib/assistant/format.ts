/**
 * The assistant's answers use a sliver of Markdown: **bold**, "- " or "• "
 * list lines, and blank lines between paragraphs. This turns an answer into
 * blocks the sheet renders as React elements — never as raw HTML.
 */

export type Run = { text: string; bold: boolean };
export type AnswerBlock = { kind: 'paragraph'; runs: Run[] } | { kind: 'list'; items: Run[][] };

export function parseAnswer(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', runs: runs(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (items.length) blocks.push({ kind: 'list', items: items.map(runs) });
    items = [];
  };

  for (const raw of keepAmountsTogether(text).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const bullet = /^(?:[-•*]|\d+[.)])\s+(.*)$/.exec(line);
    if (!line) {
      flushParagraph();
      flushList();
    } else if (bullet) {
      flushParagraph();
      items.push(bullet[1]!);
    } else {
      flushList();
      // A stray Markdown heading reads as a bold line.
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      paragraph.push(heading ? `**${heading[1]}**` : line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Split on **bold** markers; an unmatched marker stays as plain text. */
export function runs(text: string): Run[] {
  const out: Run[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) out.push({ text: text.slice(last, match.index), bold: false });
    out.push({ text: match[1]!, bold: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}

/**
 * "74 ₪" must never break between the number and the sign, and a negative
 * amount keeps its minus in front (a left-to-right mark, as the dashboard's
 * own amounts have) instead of drifting to the far side in Hebrew text.
 */
export function keepAmountsTogether(text: string): string {
  return text
    .replace(/(\d)[ \t]+₪/g, '$1\u00a0₪')
    .replace(/₪[ \t]+(-?\d)/g, '₪\u00a0$1')
    .replace(/(^|[\s(:*])-(?=\d)/g, '$1\u200e-');
}
