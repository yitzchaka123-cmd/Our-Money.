import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const sheets = readFileSync(new URL('../app/dashboard/components/EnvelopeSheets.tsx', import.meta.url), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return match?.[1] ?? '';
}

describe('the "new expected income" link in the planned-cash list', () => {
  it('is a plain link, not a red alert', () => {
    const button = /<button className="([^"]*)"[^\n]*>הכנסה צפויה חדשה<\/button>/.exec(sheets);
    expect(button?.[1]).toContain('btn-link');
  });

  it('uses the normal blue link colour', () => {
    expect(rule('.btn-ghost.btn-link')).toMatch(/color:\s*var\(--primary\)/);
  });
});
