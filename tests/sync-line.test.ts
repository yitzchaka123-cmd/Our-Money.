import { readFileSync } from 'node:fs';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PageTopBar } from '@/app/dashboard/components/PageTopBar';
import { Shell } from '@/app/dashboard/components/Shell';
import { syncedAgoLabel } from '@/lib/riseup/synced-ago';

// 15.10.2026 20:45 in Israel (UTC+3).
const NOW = new Date('2026-10-15T17:45:00Z');

describe('"last synced" wording (V2-15)', () => {
  it('counts minutes for the first hour', () => {
    expect(syncedAgoLabel('2026-10-15T17:44:40Z', NOW)).toBe('עודכן עכשיו');
    expect(syncedAgoLabel('2026-10-15T17:44:00Z', NOW)).toBe('עודכן לפני דקה');
    expect(syncedAgoLabel('2026-10-15T17:40:00Z', NOW)).toBe('עודכן לפני 5 דק׳');
    expect(syncedAgoLabel('2026-10-15T16:46:00Z', NOW)).toBe('עודכן לפני 59 דק׳');
  });

  it('then the time today, yesterday, or the date', () => {
    expect(syncedAgoLabel('2026-10-15T05:40:00Z', NOW)).toBe('עודכן היום 08:40');
    expect(syncedAgoLabel('2026-10-14T17:40:00Z', NOW)).toBe('עודכן אתמול 20:40');
    expect(syncedAgoLabel('2026-10-11T08:20:00Z', NOW)).toBe('עודכן 11.10 11:20');
  });

  it('days are Israel days, not UTC days', () => {
    // 00:30 on the 16th in Israel is still the 15th in UTC.
    const justAfterMidnight = new Date('2026-10-15T21:30:00Z');
    expect(syncedAgoLabel('2026-10-15T17:40:00Z', justAfterMidnight)).toBe('עודכן אתמול 20:40');
  });

  it('says so when there was never a sync, and copes with a clock running behind', () => {
    expect(syncedAgoLabel(null, NOW)).toBe('עוד לא סונכרן מרייזאפ');
    expect(syncedAgoLabel('2026-10-15T17:46:00Z', NOW)).toBe('עודכן עכשיו');
    expect(syncedAgoLabel('not a date', NOW)).toBe('עוד לא סונכרן מרייזאפ');
  });
});

describe('the line is always on screen, and the sync result goes there', () => {
  const dashboard = renderToStaticMarkup(
    createElement(Shell, {
      month: '2026-10',
      months: ['2026-10'],
      userName: 'יצחק',
      lastUpdated: null,
      lastSyncAt: '2026-10-15T17:40:00Z',
      briefCount: 0,
      children: null,
    }),
  );
  const page = renderToStaticMarkup(createElement(PageTopBar, { lastSyncAt: null }));

  it('sits right under the month bar on the dashboard', () => {
    expect(dashboard).toMatch(/<\/nav><p class="sync-line"[^>]*>עודכן /);
    expect(dashboard).toContain('role="status"');
  });

  it('sits under the top bar on the other pages', () => {
    expect(page).toMatch(/<\/header><p class="sync-line sync-line--page"[^>]*>עוד לא סונכרן מרייזאפ<\/p>/);
  });

  it('no floating bubble over the month name any more', () => {
    expect(dashboard).not.toContain('sync-toast');
    expect(page).not.toContain('sync-toast');
  });

  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const all = css + readFileSync(new URL('../app/assistant-and-setup.css', import.meta.url), 'utf8');
  const rule = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(all)?.[1] ?? '';
  };

  it('the top bar, the month bar and the line all stay on screen while scrolling', () => {
    expect(rule('.appbar')).toMatch(/position:\s*sticky/);
    expect(rule('.appbar')).toMatch(/top:\s*0/);
    expect(rule('.monthnav')).toMatch(/position:\s*sticky/);
    expect(rule('.sync-line')).toMatch(/position:\s*sticky/);
    // `overflow-x: hidden` on body can turn it into the scroller and unstick
    // the bars; `clip` trims the same overflow without that.
    expect(css).toMatch(/\nbody\s*\{[^}]*overflow-x:\s*clip/);
    expect(css).not.toMatch(/\nbody\s*\{[^}]*overflow-x:\s*hidden/);
  });
});
