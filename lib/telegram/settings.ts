/**
 * The bot's per-member settings (Settings → טלגרם), as plain values and
 * rules. Pure, so the settings page, the cron and the tests share them.
 * Stored on money.household_members (migration 0010); until that migration is
 * applied the columns are absent and every member gets the defaults.
 */

export type NudgeFrequency = 'daily' | 'weekdays' | 'weekly' | 'never';
export type ConfirmMode = 'instant' | 'ask';

export const DEFAULT_NUDGE: NudgeFrequency = 'daily';
export const DEFAULT_CONFIRM: ConfirmMode = 'instant';

/** In the order the settings page offers them. */
export const NUDGE_CHOICES: ReadonlyArray<{ value: NudgeFrequency; label: string }> = [
  { value: 'daily', label: 'כל יום' },
  { value: 'weekdays', label: 'א׳–ה׳' },
  { value: 'weekly', label: 'פעם בשבוע (ראשון)' },
  { value: 'never', label: 'אף פעם' },
];

export const CONFIRM_CHOICES: ReadonlyArray<{ value: ConfirmMode; label: string; hint: string }> = [
  { value: 'instant', label: 'לרשום מיד', hint: 'ההוצאה נספרת ברגע ששלחתם.' },
  { value: 'ask', label: 'לשאול לפני שרושמים', hint: 'הבוט שואל "לאשר?", ועד שמאשרים ההוצאה מסומנת "לאישור".' },
];

export function isNudgeFrequency(value: unknown): value is NudgeFrequency {
  return value === 'daily' || value === 'weekdays' || value === 'weekly' || value === 'never';
}

export function isConfirmMode(value: unknown): value is ConfirmMode {
  return value === 'instant' || value === 'ask';
}

export function nudgeFrequencyOf(member: { nudge_frequency?: string | null }): NudgeFrequency {
  return isNudgeFrequency(member.nudge_frequency) ? member.nudge_frequency : DEFAULT_NUDGE;
}

export function confirmModeOf(member: { bot_confirm_mode?: string | null }): ConfirmMode {
  return isConfirmMode(member.bot_confirm_mode) ? member.bot_confirm_mode : DEFAULT_CONFIRM;
}

/** Day of the week of a YYYY-MM-DD date (0 = Sunday), independent of the server's zone. */
export function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

/**
 * Does this member get the evening reminder on this (Israeli) date?
 * "א׳–ה׳" is Sunday to Thursday, the Israeli work week; "פעם בשבוע" is Sunday.
 */
export function wantsNudgeOn(frequency: NudgeFrequency, isoDate: string): boolean {
  const day = weekdayOf(isoDate);
  switch (frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return day >= 0 && day <= 4;
    case 'weekly':
      return day === 0;
    case 'never':
      return false;
  }
}

export function nudgeLabel(frequency: NudgeFrequency): string {
  return NUDGE_CHOICES.find((c) => c.value === frequency)?.label ?? '';
}
