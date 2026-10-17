/**
 * Household-wide bot switches in Settings → טלגרם (C24, C26), kept in
 * money.app_settings (migration 0010) as 'on' / 'off'. No row means on: both
 * are on until someone turns them off. Pure, so the settings page can import
 * it; the loader is in bot-features-load.ts.
 */

export type BotFeature = 'weekly_summary' | 'ask_new_business';

export const BOT_FEATURES: ReadonlyArray<{ key: BotFeature; label: string; hint: string }> = [
  {
    key: 'weekly_summary',
    label: 'סיכום שבועי בטלגרם',
    hint: 'כל יום ראשון בבוקר: כמה הוצאתם בשבוע שעבר, מעקבים שכדאי להציץ בהם, המזומן והתזרים הצפוי.',
  },
  {
    key: 'ask_new_business',
    label: 'לשאול על עסק חדש',
    hint: 'חיוב בעסק שלא הופיע אף פעם? הבוט שואל ״מה קניתם?״ ושומר את התשובה כהערה על החיוב.',
  },
];

export type BotFeatures = Record<BotFeature, boolean>;

export function isBotFeature(value: unknown): value is BotFeature {
  return value === 'weekly_summary' || value === 'ask_new_business';
}

/** Anything but an explicit 'off' is on. */
export function featuresFrom(rows: Array<{ key: string; value: string | null }> | null | undefined): BotFeatures {
  const off = new Set((rows ?? []).filter((r) => r.value === 'off').map((r) => r.key));
  return { weekly_summary: !off.has('weekly_summary'), ask_new_business: !off.has('ask_new_business') };
}
