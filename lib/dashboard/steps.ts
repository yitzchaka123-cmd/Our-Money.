/**
 * The setup checklist behind RiseUp's purple "השלמת N צעדים" banner. Each step
 * is a fact the app can check for itself; the banner counts them and hides
 * once nothing is missing.
 */

export type SetupStepId = 'riseup' | 'telegram' | 'name' | 'wallet';

export interface SetupStep {
  id: SetupStepId;
  title: string;
  /** One line: what is missing and how to fix it (or that it is done). */
  hint: string;
  done: boolean;
}

export interface SetupFacts {
  /** The last successful RiseUp sync; null if there never was one. */
  lastSyncAt: string | null;
  /** The signed-in member is known to the bot (it is how they signed in). */
  telegramLinked: boolean;
  preferredName: string | null;
  walletBalanceSet: boolean;
}

export function setupSteps(facts: SetupFacts): SetupStep[] {
  const riseup = facts.lastSyncAt !== null;
  const name = Boolean(facts.preferredName?.trim());
  return [
    {
      id: 'riseup',
      title: 'חיבור ל-RiseUp',
      hint: riseup
        ? 'התזרים מסונכרן מ-RiseUp.'
        : 'עוד לא סונכרן אף פעם. סנכרנו עכשיו — ואם זה לא עובד, בדיקת ההגדרות תגיד למה.',
      done: riseup,
    },
    {
      id: 'telegram',
      title: 'חיבור לבוט בטלגרם',
      hint: facts.telegramLinked
        ? 'אפשר לרשום מזומן בהודעה או בהקלטה לבוט.'
        : 'שלחו /start לבוט בטלגרם כדי לרשום מזומן בהודעה או בהקלטה.',
      done: facts.telegramLinked,
    },
    {
      id: 'name',
      title: 'איך לקרוא לך?',
      hint: name
        ? `נגיד "היי ${facts.preferredName!.trim()}".`
        : 'כך נפנה אליך בברכה בראש התזרים, במקום השם של חשבון הטלגרם.',
      done: name,
    },
    {
      id: 'wallet',
      title: 'כמה מזומן יש עכשיו',
      hint: facts.walletBalanceSet
        ? 'הארנק מעודכן.'
        : 'ספרו את המזומן שבארנק ורשמו את הסכום, כדי שהיתרה תתחיל נכון.',
      done: facts.walletBalanceSet,
    },
  ];
}

/** The banner's line in three runs (the middle one bold), or null to hide it. */
export function stepsBannerText(
  steps: SetupStep[],
): { lead: string; strong: string; tail: string } | null {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  if (done === 0) return { lead: 'נשארו', strong: `${steps.length} צעדים`, tail: 'קטנים כדי להתחיל' };
  return { lead: 'השלמת', strong: `${done} מתוך ${steps.length} צעדים`, tail: 'והתחלת לצמוח!' };
}

/**
 * Has anyone told the app how much cash there is? An amount set or added by
 * hand, cash income, a cash spend or a transfer all count. A withdrawal the
 * bank reported does not: it arrives by itself and says nothing about what
 * was already in the wallet.
 */
export function walletBalanceSet({
  topups,
  spends,
  transfers,
}: {
  topups: { source: string }[];
  spends: number;
  transfers: number;
}): boolean {
  return spends > 0 || transfers > 0 || topups.some((t) => t.source !== 'riseup_withdrawal');
}
