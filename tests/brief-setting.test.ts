import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DrawerContent } from '@/app/dashboard/components/Shell';
import { SettingsView, type SettingsData } from '@/app/settings/SettingsView';
import { migrationProblems } from '@/scripts/lib/migration-guard';

const settings: SettingsData = {
  preferredName: 'יצחק',
  telegramName: 'Nechemiah',
  members: [{ id: 'm1', name: 'יצחק', telegramName: 'Nechemiah', isYou: true }],
  accounts: [],
  lastSync: null,
  month: '2026-10',
  yearAgo: '2025-10',
};

describe('turning the daily brief off (V2-9)', () => {
  it('offers one switch in Settings, on by default', () => {
    const html = renderToStaticMarkup(createElement(SettingsView, { data: settings }));
    expect(html).toContain('הסיכום היומי');
    expect(html).toMatch(/role="switch"[^>]*aria-checked="true"/);
  });

  it('shows the switch off when the member turned it off', () => {
    const html = renderToStaticMarkup(createElement(SettingsView, { data: { ...settings, briefEnabled: false } }));
    expect(html).toMatch(/role="switch"[^>]*aria-checked="false"/);
  });

  it('drops the drawer link when the brief is off', () => {
    const on = renderToStaticMarkup(createElement(DrawerContent, { userName: 'יצחק', lastUpdated: null, briefCount: 0 }));
    const off = renderToStaticMarkup(createElement(DrawerContent, { userName: 'יצחק', lastUpdated: null, briefCount: null }));
    expect(on).toContain('href="/dashboard?brief=1"');
    expect(off).not.toContain('href="/dashboard?brief=1"');
  });

  it('stores the setting per member, on by default, inside money only', () => {
    const sql = readFileSync('supabase/migrations/0012_brief_setting_and_seen_cards.sql', 'utf8');
    expect(sql).toMatch(/money\.household_members\s+add column if not exists show_daily_brief boolean not null default true/);
    expect(migrationProblems(sql)).toEqual([]);
  });
});
