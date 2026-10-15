import { envelopeChoices, type EnvelopeRef } from '@/lib/cash/envelopes';
import { isCustomKey, resolveOverride, trackerKey, type TrackerOverride } from '@/lib/dashboard/trackers';

/**
 * The bot's categories ARE the household's envelopes for the month — exactly
 * what the dashboard shows (feedback video 2 #10, video 3 #2, video 4 #4):
 * every tracker by its real name (our rename wins over RiseUp's automatic
 * one; a tracker we stopped following is gone), then "הוצאות משתנות" and
 * "הוצאות קבועות". No raw RiseUp labels ("מזון וצריכה", "פנאי ובידור"), and
 * never a made-up "אחר": what fits nowhere is a variable expense, which is
 * what RiseUp itself does with an uncategorised charge.
 *
 * Pure, so the intake prompt, the picker, /month and the tests share it.
 */

export const VARIABLE_NAME = 'הוצאות משתנות';
export const FIXED_NAME = 'הוצאות קבועות';

/** RiseUp's built-in supermarket tracker (the couple call it "סופר"). */
export const SUPERMARKET_KEY = 'v2-default-il-expense-category-2';
/** RiseUp's built-in eating-out tracker ("אוכל בחוץ"). */
export const EATING_OUT_KEY = 'v2-default-il-expense-category-9';

export interface BotEnvelope {
  /** What the couple see and what the spend's category is set to. */
  name: string;
  type: 'trackingCategory' | 'variable' | 'fixed';
  /** This month's envelope id; null when the month has not been synced yet. */
  envelopeId: string | null;
  /** The month-independent tracker key, for trackers. */
  key: string | null;
  /** What belongs here, for the AI (never shown to the couple). */
  hint: string | null;
}

/** What each of RiseUp's built-in trackers collects, in the words people use. */
const TRACKER_HINTS: Readonly<Record<string, string>> = {
  [SUPERMARKET_KEY]:
    'groceries and household shopping: סופר, סופרמרקט, שופרסל, רמי לוי, ויקטורי, יוחננוף, אושר עד, חצי חינם, טיב טעם, מכולת, מינימרקט, makolet, supermarket, groceries',
  [EATING_OUT_KEY]:
    'eating or drinking out and takeaway: מסעדה, בית קפה, קפה, פלאפל, שווארמה, פיצה, סושי, המבורגר, וולט, תן ביס, משלוח אוכל, restaurant, cafe, coffee, takeaway',
  'v2-default-il-expense-category-3': 'leisure and outings: סרט, הופעה, בילוי, אטרקציה, טיול',
  'v2-default-il-expense-category-10': 'education and children: גן, צהרון, חוג, ספרים, שיעור פרטי',
  'v2-default-il-expense-category-13': 'car: דלק, חניה, מוסך, טסט, שטיפה, כביש 6',
  'v2-default-il-expense-category-16': 'bank and service fees: עמלה',
  'v2-default-il-expense-category-28': 'clothes and shoes: בגדים, נעליים',
  'v2-default-il-expense-category-33': 'pharmacy: סופר-פארם, בית מרקחת, תרופות',
};

const VARIABLE_HINT = 'everything that fits no other envelope — the catch-all';
const FIXED_HINT = 'a payment that repeats every month at about the same amount: שכר דירה, ועד בית, עוזרת בית, מנוי, חוג קבוע';

function norm(label: string): string {
  return label.trim().replace(/\s+/g, ' ');
}

/**
 * The month's envelopes as the bot offers them: trackers (by name, A→Z), then
 * variable, then fixed. `refs` is the month's envelopes as stored (RiseUp's
 * plus trackers of our own); `overrides` are money.tracker_overrides rows.
 */
export function botEnvelopes(refs: EnvelopeRef[], overrides: TrackerOverride[], month: string): BotEnvelope[] {
  const choices = envelopeChoices(refs);
  const trackers: BotEnvelope[] = [];
  const names = new Set<string>([VARIABLE_NAME, FIXED_NAME]);

  for (const choice of choices) {
    if (choice.type !== 'trackingCategory') continue;
    const key = trackerKey(choice.envelopeId);
    const custom = isCustomKey(key);
    const override = custom ? null : resolveOverride(overrides, key, month);
    if (override?.hidden) continue;
    const name = norm(override?.name ?? choice.name);
    if (!name || names.has(name)) continue;
    names.add(name);
    trackers.push({
      name,
      type: 'trackingCategory',
      envelopeId: choice.envelopeId,
      key,
      hint: TRACKER_HINTS[key] ?? (choice.categoryLabels?.length ? choice.categoryLabels.join(', ') : null),
    });
  }
  trackers.sort((a, b) => a.name.localeCompare(b.name, 'he'));

  const variable = choices.find((c) => c.type === 'variable');
  const fixed = choices.find((c) => c.type === 'fixed');
  return [
    ...trackers,
    { name: VARIABLE_NAME, type: 'variable', envelopeId: variable?.envelopeId ?? null, key: null, hint: VARIABLE_HINT },
    { name: FIXED_NAME, type: 'fixed', envelopeId: fixed?.envelopeId ?? null, key: null, hint: FIXED_HINT },
  ];
}

/** The catch-all envelope of a list (always present in botEnvelopes' output). */
export function variableEnvelope(envelopes: BotEnvelope[]): BotEnvelope {
  return (
    envelopes.find((e) => e.type === 'variable') ?? {
      name: VARIABLE_NAME,
      type: 'variable',
      envelopeId: null,
      key: null,
      hint: VARIABLE_HINT,
    }
  );
}

export function envelopeByName(envelopes: BotEnvelope[], name: string | null | undefined): BotEnvelope | null {
  if (!name) return null;
  const wanted = norm(name);
  return envelopes.find((e) => e.name === wanted) ?? null;
}

const SUPERMARKET_WORDS =
  /סופר(?!.?פארם)|שופרסל|רמי.?לוי|ויקטורי|יוחננוף|אושר.?עד|חצי.?חינם|טיב.?טעם|מכולת|מינימרקט|supermarket|grocer|makolet/i;
const EATING_OUT_WORDS =
  /מסעד|בית.?קפה|קפה|פלאפל|שווארמ|פיצ|סושי|המבורגר|וולט|תן.?ביס|restaurant|cafe|café|coffee|pizza|falafel|wolt/i;

function supermarketTracker(envelopes: BotEnvelope[]): BotEnvelope | null {
  return (
    envelopes.find((e) => e.key === SUPERMARKET_KEY) ??
    envelopes.find((e) => e.type === 'trackingCategory' && /^(סופר|כלכלה|מכולת)/.test(e.name)) ??
    null
  );
}

function eatingOutTracker(envelopes: BotEnvelope[]): BotEnvelope | null {
  return (
    envelopes.find((e) => e.key === EATING_OUT_KEY) ??
    envelopes.find((e) => e.type === 'trackingCategory' && /אוכל בחוץ|מסעדות/.test(e.name)) ??
    null
  );
}

/**
 * The safety net under the AI: supermarket words go to the supermarket
 * tracker and restaurant words to "אוכל בחוץ", when the month has them.
 */
export function guessEnvelopeFromWords(text: string, envelopes: BotEnvelope[]): BotEnvelope | null {
  if (SUPERMARKET_WORDS.test(text)) {
    const tracker = supermarketTracker(envelopes);
    if (tracker) return tracker;
  }
  if (EATING_OUT_WORDS.test(text)) {
    const tracker = eatingOutTracker(envelopes);
    if (tracker) return tracker;
  }
  return null;
}

/**
 * Where an expense the AI labelled `category` goes. A real envelope name is
 * taken as is — except the catch-all, which the words may still beat; any
 * other label (an old RiseUp category, "אחר") is never kept.
 */
export function fileExpense(category: string, words: string, envelopes: BotEnvelope[]): BotEnvelope {
  const named = envelopeByName(envelopes, category);
  if (named && named.type !== 'variable') return named;
  return guessEnvelopeFromWords(words, envelopes) ?? variableEnvelope(envelopes);
}

/**
 * The same envelope in another month: by tracker key first (names can be
 * edited), then by name, then that month's catch-all.
 */
export function sameEnvelopeIn(envelope: BotEnvelope, other: BotEnvelope[]): BotEnvelope {
  if (envelope.key) {
    const byKey = other.find((e) => e.key === envelope.key);
    if (byKey) return byKey;
  }
  if (envelope.type !== 'trackingCategory') {
    const sameType = other.find((e) => e.type === envelope.type);
    if (sameType) return sameType;
  }
  return envelopeByName(other, envelope.name) ?? variableEnvelope(other);
}

/**
 * The envelope a stored cash spend sits in, named as the bot names it: its
 * pinned tracker (folded by key, so a weekly tracker's parts are one), else
 * fixed or variable; an unpinned spend by its category label. A spend in a
 * tracker we stopped following is a variable expense, as on the dashboard.
 */
export function envelopeOfSpend(
  spend: { envelope_id: string | null; envelope_type: string | null; category: string },
  envelopes: BotEnvelope[],
): BotEnvelope {
  if (spend.envelope_id && spend.envelope_type === 'trackingCategory') {
    const key = trackerKey(spend.envelope_id);
    const tracker = envelopes.find((e) => e.key === key);
    if (tracker) return tracker;
    return variableEnvelope(envelopes);
  }
  if (spend.envelope_type === 'fixed') return envelopes.find((e) => e.type === 'fixed') ?? variableEnvelope(envelopes);
  if (spend.envelope_type === 'variable' && spend.envelope_id) {
    // A tracker of our own collects the variable spending with its label.
    const custom = envelopes.find((e) => e.key && isCustomKey(e.key) && e.key.slice('custom:'.length) === norm(spend.category));
    return custom ?? variableEnvelope(envelopes);
  }
  const named = envelopeByName(envelopes, spend.category);
  return named ?? variableEnvelope(envelopes);
}
