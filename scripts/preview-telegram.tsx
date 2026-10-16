/**
 * Static previews of Settings → טלגרם and קבוצה משפחתית, from a fixture.
 *
 *   npx tsx scripts/preview-telegram.tsx <outdir>
 *
 * Writes telegram-settings.html (no group yet) and telegram-connected.html;
 * shoot them like scripts/ui-shots-c.sh does (fixed-width iframe).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import { SettingsView, type SettingsData } from '../app/settings/SettingsView';

const base: SettingsData = {
  preferredName: 'יצחק',
  telegramName: 'Nechemiah Seltzer',
  members: [
    { id: 'm1', name: 'יצחק', telegramName: 'Nechemiah Seltzer', isYou: true },
    { id: 'm2', name: 'שרה', telegramName: 'שרה', isYou: false },
  ],
  accounts: [],
  lastSync: '15.10 20:40',
  month: '2026-10',
  yearAgo: '2025-10',
  telegram: {
    members: [
      { id: 'm1', name: 'יצחק', isYou: true, nudge: 'weekdays', confirm: 'ask' },
      { id: 'm2', name: 'שרה', isYou: false, nudge: 'daily', confirm: 'instant' },
    ],
    group: { connected: null, addToGroupUrl: 'https://t.me/our_money_bot?startgroup=family' },
  },
};

const screens: Record<string, SettingsData> = {
  'telegram-settings': base,
  'telegram-connected': {
    ...base,
    telegram: { ...base.telegram!, group: { connected: { title: 'הבית שלנו', fromServerSetting: false }, addToGroupUrl: 'https://t.me/our_money_bot?startgroup=family' } },
  },
};

const css = ['app/globals.css', 'app/wallets-accounts.css', 'app/settings/telegram-settings.css']
  .map((f) => readFileSync(join(process.cwd(), f), 'utf8'))
  .join('\n');
const out = process.argv[2] ?? '.shots';
mkdirSync(out, { recursive: true });

for (const [name, data] of Object.entries(screens)) {
  // Start the page at the Telegram sections, which is what these previews are for.
  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title><style>${css}</style></head>
<body>${renderToStaticMarkup(<SettingsView data={data} />)}
<script>document.getElementById('tg-settings-title')?.closest('section')?.scrollIntoView();</script></body></html>`;
  writeFileSync(join(out, `${name}.html`), html);
}
console.log(`Wrote ${Object.keys(screens).length} previews to ${out}`);
