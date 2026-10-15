import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SettingsView, type SettingsData } from '@/app/settings/SettingsView';
import { composeNudge } from '@/lib/telegram/nudge';
import { confirmModeOf, nudgeFrequencyOf, wantsNudgeOn } from '@/lib/telegram/settings';

// 2026-10-15 is a Thursday, the 16th a Friday, the 17th Saturday, the 18th Sunday.
describe('V4-2: how often the evening reminder comes', () => {
  it('daily is every day, never is no day', () => {
    for (const day of ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']) {
      expect(wantsNudgeOn('daily', day)).toBe(true);
      expect(wantsNudgeOn('never', day)).toBe(false);
    }
  });

  it('א׳–ה׳ is Sunday to Thursday', () => {
    expect(wantsNudgeOn('weekdays', '2026-10-15')).toBe(true);
    expect(wantsNudgeOn('weekdays', '2026-10-16')).toBe(false);
    expect(wantsNudgeOn('weekdays', '2026-10-17')).toBe(false);
    expect(wantsNudgeOn('weekdays', '2026-10-18')).toBe(true);
  });

  it('once a week is Sunday', () => {
    expect(wantsNudgeOn('weekly', '2026-10-18')).toBe(true);
    expect(wantsNudgeOn('weekly', '2026-10-15')).toBe(false);
  });

  it('defaults to daily and instant before anyone chooses (or before the migration)', () => {
    expect(nudgeFrequencyOf({})).toBe('daily');
    expect(nudgeFrequencyOf({ nudge_frequency: 'bogus' })).toBe('daily');
    expect(nudgeFrequencyOf({ nudge_frequency: 'never' })).toBe('never');
    expect(confirmModeOf({})).toBe('instant');
    expect(confirmModeOf({ bot_confirm_mode: 'ask' })).toBe('ask');
  });

  const members = [
    { id: 'm1', displayName: 'יצחק', telegramUserId: 111 },
    { id: 'm2', displayName: 'שרה', telegramUserId: 222 },
  ];

  it('leaves out a member who turned the reminder off, in private', () => {
    const messages = composeNudge({
      members,
      loggedToday: new Set(),
      due: [],
      reviewCount: 0,
      groupChatId: null,
      remindToday: new Set(['m2']),
    });
    expect(messages.map((m) => m.chatId)).toEqual([222]);
  });

  it('names in the group only those who want it tonight, and stays quiet when nobody does', () => {
    const one = composeNudge({ members, loggedToday: new Set(), due: [], reviewCount: 2, groupChatId: -100, remindToday: new Set(['m2']) });
    expect(one).toHaveLength(1);
    expect(one[0]!.text).toContain('שרה');
    expect(one[0]!.text).not.toContain('יצחק');

    const none = composeNudge({ members, loggedToday: new Set(), due: [], reviewCount: 2, groupChatId: -100, remindToday: new Set() });
    expect(none).toEqual([]);
  });
});

describe('V4-2: Settings → טלגרם', () => {
  const data: SettingsData = {
    preferredName: 'יצחק',
    telegramName: 'Nechemiah',
    members: [{ id: 'm1', name: 'יצחק', telegramName: 'Nechemiah', isYou: true }],
    accounts: [],
    lastSync: null,
    month: '2026-10',
    yearAgo: '2025-10',
    telegram: {
      members: [
        { id: 'm1', name: 'יצחק', isYou: true, nudge: 'weekly', confirm: 'instant' },
        { id: 'm2', name: 'שרה', isYou: false, nudge: 'daily', confirm: 'instant' },
      ],
    },
  };
  const html = renderToStaticMarkup(createElement(SettingsView, { data }));

  it('has a טלגרם section with the reminder question and the four choices per person', () => {
    expect(html).toContain('>טלגרם</h2>');
    expect(html).toContain('היו היום הוצאות במזומן?');
    for (const label of ['כל יום', 'א׳–ה׳', 'פעם בשבוע (ראשון)', 'אף פעם']) expect(html).toContain(label);
    expect(html.match(/role="radiogroup"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('marks each person’s current choice', () => {
    const yitzchak = html.slice(html.indexOf('יצחק<span'), html.indexOf('שרה</p>'));
    expect(yitzchak).toMatch(/aria-checked="true"[^>]*data-selected="true"[^>]*>פעם בשבוע/);
    const sara = html.slice(html.indexOf('שרה</p>'));
    expect(sara).toMatch(/aria-checked="true"[^>]*data-selected="true"[^>]*>כל יום/);
  });
});
