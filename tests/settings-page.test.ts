import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SettingsView, type SettingsData } from '@/app/settings/SettingsView';

const data: SettingsData = {
  preferredName: 'יצחק',
  telegramName: 'Nechemiah',
  members: [
    { id: 'm1', name: 'יצחק', telegramName: 'Nechemiah', isYou: true },
    { id: 'm2', name: 'שרה', telegramName: 'שרה', isYou: false },
  ],
  accounts: [
    { key: 'a', name: 'כרטיס 0848', provider: 'לאומי קארד', kind: 'card', named: true },
    { key: 'b', name: 'בנק לאומי', provider: 'בנק לאומי', kind: 'bank', named: false },
  ],
  lastSync: '11.10 11:20',
  month: '2026-10',
  yearAgo: '2025-10',
};

describe('settings page (V1-25)', () => {
  const html = renderToStaticMarkup(createElement(SettingsView, { data }));

  it('shows your own name, editable, and the Telegram name only as where you sign in from', () => {
    expect(html).toContain('<h1 class="settings-name">יצחק</h1>');
    expect(html).toContain('בטלגרם: Nechemiah');
    expect(html).toContain('עריכת השם');
  });

  it('lists connected accounts by their names, read only, with a way to name them', () => {
    expect(html).toContain('כרטיס 0848');
    expect(html).toContain('לאומי קארד');
    expect(html).toContain('href="/accounts"');
    expect(html).toContain('לתת שמות לכרטיסים (1 בלי שם)');
  });

  it('lists the Telegram members and says the RiseUp connection is read-only', () => {
    expect(html).toContain('מחוברים בטלגרם');
    expect(html).toContain('שרה');
    expect(html).toContain('קריאה בלבד');
    expect(html).toContain('שום דבר כאן לא משנה את החשבון שלכם שם');
  });

  it('asks for a name when none is set yet', () => {
    const fresh = renderToStaticMarkup(createElement(SettingsView, { data: { ...data, preferredName: null } }));
    expect(fresh).toContain('איך לקרוא לך?');
  });
});
