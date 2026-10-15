import { readFileSync } from 'node:fs';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { POST as signOut } from '@/app/api/auth/logout/route';
import { DrawerContent, Shell } from '@/app/dashboard/components/Shell';
import { SESSION_COOKIE } from '@/lib/auth/session';

describe('side drawer (V1-24)', () => {
  const html = renderToStaticMarkup(
    createElement(DrawerContent, { userName: 'יצחק', lastUpdated: '11.10 11:20', briefCount: 2, onOpenWallets: () => {} }),
  );

  it('keeps only what we use, in order', () => {
    const labels = [...html.matchAll(/<span class="drawer-label">([^<]+)<\/span>/g)].map((m) => m[1]);
    expect(labels).toEqual(['תזרים חודשי', 'הרייזאפ היומי', 'מצב העו״ש והאשראי', 'ארנקים', 'הגדרות', 'התנתקות']);
    // Sync is the refresh button itself.
    expect(html).toContain('עדכון מרייזאפ');
  });

  it('drops the rest', () => {
    expect(html).not.toContain('ייצוא');
    expect(html).not.toContain('המזומן היומי');
  });

  it('links to the pages, and the gear opens settings', () => {
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/accounts"');
    expect(html.match(/href="\/settings"/g)?.length).toBe(2);
    expect(html).toContain('action="/api/auth/logout"');
  });
});

describe('sign out', () => {
  it('clears the session cookie and goes back to the front page', async () => {
    const response = await signOut(new Request('https://our-money.test/api/auth/logout', { method: 'POST' }));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://our-money.test/');
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${SESSION_COOKIE}=;`);
    expect(cookie).toMatch(/Max-Age=0/i);
  });
});

describe('side drawer opens from the right, like RiseUp (V4-1)', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const rule = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  };

  it('sits on the right edge (physical, whatever the page direction)', () => {
    const drawer = rule('.drawer');
    expect(drawer).toMatch(/\bright:\s*0/);
    expect(drawer).not.toMatch(/inset-inline-end/);
    // Rounded on its inner (left) side, as RiseUp's is.
    expect(drawer).toMatch(/border-radius:\s*\d+px 0 0 \d+px/);
  });

  it('slides in: hidden off the right edge when closed, in place when open', () => {
    expect(rule('.drawer')).toMatch(/transform:\s*translateX\(100%\)/);
    expect(rule('.drawer')).toMatch(/transition:/);
    expect(rule(".drawer[data-open='true']")).toMatch(/transform:\s*none/);
  });

  it('does not animate for people who asked for less motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.drawer[^{]*\{[^}]*transition:\s*none/);
  });

  it('is in the page but inert while closed', () => {
    const shell = renderToStaticMarkup(
      createElement(Shell, { month: '2026-10', months: ['2026-10'], userName: 'יצחק', lastUpdated: null, briefCount: 0 }, null),
    );
    expect(shell).toMatch(/<aside class="drawer"[^>]*data-open="false"/);
    expect(shell).toMatch(/<aside class="drawer"[^>]*inert/);
  });
});
