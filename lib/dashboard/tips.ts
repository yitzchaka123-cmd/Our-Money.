/**
 * Money tips for the top carousel (feedback video 4, item 10): short,
 * practical, our own words, for an Israeli household — habits and checks,
 * never a financial product.
 *
 * Many tips have a condition on the household's own numbers (eating out above
 * its target, many small card charges, a negative forecast, salary that just
 * came in, weekend spending, subscriptions, fees…); those come first when
 * they hold. One or two tips join the carousel after the data cards, and each
 * is shown once, on the rules of the insight cards (V2-17).
 *
 * Pure and client-safe.
 */

import { isoDateInIsrael } from '@/lib/dates';
import {
  stillShowable,
  type Insight,
  type InsightFeedback,
  type InsightInput,
  type TipArt,
} from '@/lib/dashboard/insights';

// ---------------------------------------------------------------------------
// What the tips can see
// ---------------------------------------------------------------------------

export interface TipFacts {
  monthStart: boolean;
  monthEnd: boolean;
  eatingOutOver: boolean;
  eatingOutFast: boolean;
  supermarketOver: boolean;
  supermarketFast: boolean;
  anyTrackerOver: boolean;
  /** Many small charges on cards this month. */
  manySmallCharges: boolean;
  forecastNegative: boolean;
  forecastPositive: boolean;
  cashNegative: boolean;
  cashUsedOften: boolean;
  salaryJustArrived: boolean;
  /** Much of this month's spending fell on Friday and Saturday. */
  weekendHeavy: boolean;
  /** Distinct subscription-like businesses charged this month. */
  subscriptions: number;
  feesSeen: boolean;
  installments: number;
  deliveries: number;
  coffees: number;
  fuel: number;
  bigCharge: boolean;
}

const EATING_OUT = /אוכל בחוץ|מסעד/;
const SUPERMARKET = /סופר|כלכלה|מזון|מכולת/;
const SUBSCRIPTION =
  /netflix|spotify|apple\.com|itunes|icloud|google|youtube|disney|amazon|prime video|openai|chatgpt|adobe|microsoft|canva|dropbox|deezer|audible|נטפליקס|ספוטיפיי|מנוי/i;
const FEES = /עמל|דמי כרטיס|דמי ניהול|ריבית/;
const DELIVERY = /wolt|וולט|תן ביס|10bis|משלוח/i;
const COFFEE = /קפה|cafe|coffee|ארומה|aroma|cofix|קופיקס|לנדוור|גרג/i;
const FUEL = /דלק|סונול|sonol|דור אלון|dor alon|delek|yellow|(^|\s)פז(\s|$)|paz/i;

/** Small enough that it is a habit rather than a purchase. */
const SMALL_ILS = 40;
const SMALL_MANY = 15;
const SALARY_MIN_ILS = 2000;
const SALARY_RECENT_DAYS = 3;
const WEEKEND_SHARE = 0.4;
const WEEKEND_MIN_ILS = 400;
const BIG_ILS = 1000;
const CASH_OFTEN = 6;
/** "Fast": this far ahead of the share of the month gone. */
const FAST_TIMES = 1.2;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysInMonth(month: string): number {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year!, m!, 0)).getUTCDate();
}

/** What the household's month looks like, in the terms the tips ask about. */
export function tipFacts(input: InsightInput): TipFacts {
  const day = Number(input.today.slice(8, 10));
  const total = daysInMonth(input.month);
  const share = day / total;

  const trackers = (pattern: RegExp) => input.trackers.filter((t) => t.planned > 0 && pattern.test(t.name));
  const over = (pattern: RegExp) => trackers(pattern).some((t) => t.actual > t.planned);
  const fast = (pattern: RegExp) => trackers(pattern).some((t) => t.actual > t.planned * share * FAST_TIMES);

  const inMonth = input.envelopes.flatMap((e) =>
    e.actuals
      .filter((a) => a.transactionDate && a.transactionDate.slice(0, 7) === input.month && a.transactionDate <= input.today)
      .map((a) => ({ ...a, envelopeType: e.type })),
  );
  const spends = inMonth.filter((a) => !a.isIncome && a.envelopeType !== 'variableIncome' && a.envelopeType !== 'cashIncome');
  const daily = spends.filter((a) => a.envelopeType === 'variable' || a.envelopeType === 'trackingCategory');
  const text = (a: { businessName: string; categoryLabel: string | null }) => `${a.businessName} ${a.categoryLabel ?? ''}`;
  const count = (pattern: RegExp) => spends.filter((a) => pattern.test(text(a))).length;

  const weekend = daily.filter((a) => [5, 6].includes(new Date(`${a.transactionDate}T12:00:00Z`).getUTCDay()));
  const weekendSum = weekend.reduce((s, a) => s + a.amountIls, 0);
  const dailySum = daily.reduce((s, a) => s + a.amountIls, 0);
  const salaryFrom = addDays(input.today, -SALARY_RECENT_DAYS);

  return {
    monthStart: day <= 5,
    monthEnd: day >= total - 6,
    eatingOutOver: over(EATING_OUT),
    eatingOutFast: fast(EATING_OUT),
    supermarketOver: over(SUPERMARKET),
    supermarketFast: fast(SUPERMARKET),
    anyTrackerOver: input.trackers.some((t) => t.planned > 0 && t.actual > t.planned),
    manySmallCharges: daily.filter((a) => !a.cash && a.amountIls > 0 && a.amountIls <= SMALL_ILS).length >= SMALL_MANY,
    forecastNegative: input.forecast < 0,
    forecastPositive: input.forecast > 0,
    cashNegative: input.wallet.balance < 0,
    cashUsedOften: spends.filter((a) => a.cash).length >= CASH_OFTEN,
    salaryJustArrived: inMonth.some(
      (a) => a.isIncome && a.amountIls >= SALARY_MIN_ILS && a.transactionDate! >= salaryFrom && a.transactionDate! <= input.today,
    ),
    weekendHeavy: weekendSum >= WEEKEND_MIN_ILS && dailySum > 0 && weekendSum / dailySum >= WEEKEND_SHARE,
    subscriptions: new Set(spends.filter((a) => SUBSCRIPTION.test(text(a))).map((a) => a.businessName.trim().toLowerCase())).size,
    feesSeen: spends.some((a) => FEES.test(text(a))),
    installments: spends.filter((a) => a.isInstallment).length,
    deliveries: count(DELIVERY),
    coffees: count(COFFEE),
    fuel: count(FUEL),
    bigCharge: daily.some((a) => a.amountIls >= BIG_ILS),
  };
}

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

export interface Tip {
  /** Stable forever: the card's key is "tip:<id>", and a seen tip never returns. */
  id: string;
  art: TipArt;
  /** The bold opening of the card and the popup's heading. */
  title: string;
  /** One or two plain sentences. */
  body: string;
  /** Under "מה עכשיו?" in the popup. */
  next?: string;
  /** Shown only while this holds; tips with a condition come first. */
  when?: (facts: TipFacts) => boolean;
}

const eatingOut = (f: TipFacts) => f.eatingOutOver || f.eatingOutFast;
const supermarket = (f: TipFacts) => f.supermarketOver || f.supermarketFast;

export const TIPS: Tip[] = [
  // --- Eating out ------------------------------------------------------------
  {
    id: 'eat-plan-nights', art: 'tip-cup', when: eatingOut,
    title: 'ערב בחוץ, מתוכנן מראש',
    body: 'כשקובעים מראש באילו ערבים יוצאים לאכול, נהנים מהם יותר ולא מרגישים שהחודש בורח.',
    next: 'בחרו יחד ערב אחד או שניים בשבוע ליציאה, ובשאר הערבים תכננו ארוחה פשוטה בבית.',
  },
  {
    id: 'eat-cook-double', art: 'tip-cup', when: eatingOut,
    title: 'מבשלים פעם, אוכלים פעמיים',
    body: 'רוב ההזמנות קורות בערבים שאין בהם כוח לבשל. מנה כפולה שנשמרת במקפיא היא ארוחה מוכנה בדיוק לערב כזה.',
    next: 'בפעם הבאה שאתם מבשלים, הכינו כמות כפולה והקפיאו חצי.',
  },
  {
    id: 'eat-lunch-box', art: 'tip-cup', when: eatingOut,
    title: 'צהריים מהבית',
    body: 'ארוחת צהריים בעבודה עולה בדרך כלל עשרות שקלים. קופסה מהבית כמה פעמים בשבוע חוסכת מאות שקלים בחודש.',
    next: 'הכינו שתי קופסאות לשבוע הקרוב מהשאריות של ארוחת הערב.',
  },
  {
    id: 'eat-share-dish', art: 'tip-cup', when: eatingOut,
    title: 'מנה אחת לשניים',
    body: 'במסעדות רבות המנות גדולות. לחלוק מנה ראשונה או קינוח זה עדיין ערב טוב, עם חשבון קטן יותר.',
  },
  {
    id: 'eat-cash-budget', art: 'tip-cup', when: eatingOut,
    title: 'תקציב יציאות בארנק',
    body: 'כשסכום היציאות לשבוע יושב בארנק, רואים בעיניים כמה נשאר, וקל יותר לעצור בזמן.',
    next: 'שימו בצד במזומן את סכום היציאות לשבוע ורשמו כל יציאה כאן.',
  },
  {
    id: 'eat-extras', art: 'tip-cup', when: eatingOut,
    title: 'התוספות שעל החשבון',
    body: 'שתייה, תוספות ודמי שירות יכולים להוסיף שליש לחשבון. מים לשולחן וויתור על תוספת אחת עושים הבדל בלי לוותר על הערב.',
  },

  // --- Supermarket -----------------------------------------------------------
  {
    id: 'super-list', art: 'tip-cart', when: supermarket,
    title: 'רשימה לפני הסופר',
    body: 'קנייה עם רשימה כתובה מצמצמת קניות של הרגע. עוברים קודם על המקרר והמזווה, ורק אז כותבים.',
    next: 'לפני הקנייה הבאה, הציצו במקרר ובמזווה וכתבו רשימה.',
  },
  {
    id: 'super-not-hungry', art: 'tip-cart', when: supermarket,
    title: 'לא קונים רעבים',
    body: 'מי שנכנס לסופר רעב קונה יותר, ובעיקר חטיפים. משהו קטן לאכול לפני הקנייה הוא חיסכון קטן ובטוח.',
  },
  {
    id: 'super-unit-price', art: 'tip-cart', when: supermarket,
    title: 'המחיר ליחידה',
    body: 'על תווית המדף מופיע גם המחיר ל-100 גרם או לליטר. האריזה הגדולה לא תמיד הזולה, והמבצע לא תמיד משתלם.',
  },
  {
    id: 'super-house-brand', art: 'tip-cart', when: supermarket,
    title: 'מותג הבית',
    body: 'מוצרי יסוד של מותג הרשת — אורז, פסטה, שימורים, חומרי ניקוי — זולים לרוב בעשרות אחוזים, ובדרך כלל לא מרגישים בהבדל.',
  },
  {
    id: 'super-one-big', art: 'tip-cart', when: supermarket,
    title: 'קנייה גדולה אחת',
    body: 'כל קפיצה קטנה לסופר מוסיפה עוד כמה מוצרים שלא תכננתם. קנייה גדולה אחת בשבוע והשלמות קטנות שומרות על הסכום.',
  },
  {
    id: 'super-online-cart', art: 'tip-cart', when: supermarket,
    title: 'הסכום מול העיניים',
    body: 'בהזמנה מהאתר רואים את הסכום מצטבר לפני התשלום, ואפשר להוריד מוצרים בלי מבוכה בקופה.',
  },
  {
    id: 'super-meal-plan', art: 'tip-calendar', when: supermarket,
    title: 'תפריט לשבוע',
    body: 'תכנון של ארוחות הערב לשבוע מראש מוביל לרשימת קניות מדויקת ולפחות אוכל שנזרק.',
    next: 'שבו עשר דקות ביום חמישי ותכננו את ארוחות השבוע הבא.',
  },
  {
    id: 'super-waste', art: 'tip-cart', when: supermarket,
    title: 'מה נזרק השבוע?',
    body: 'חלק לא קטן מהאוכל שקונים נזרק בסוף. מבט על מה שנזרק השבוע מלמד מה לקנות פחות בפעם הבאה.',
  },

  // --- Small card charges ----------------------------------------------------
  {
    id: 'small-add-up', art: 'tip-card', when: (f) => f.manySmallCharges,
    title: 'הקטנים מצטברים',
    body: 'החודש היו הרבה חיובים קטנים בכרטיס. כל אחד לבד לא מורגש, אבל יחד הם יכולים להגיע למאות שקלים.',
    next: 'פתחו את ההוצאות המשתנות ועברו על החיובים הקטנים — מה מהם באמת היה צריך?',
  },
  {
    id: 'small-on-the-way', art: 'tip-card', when: (f) => f.manySmallCharges,
    title: 'קנייה של הדרך',
    body: 'שתייה, חטיף או מאפה בדרך הם הוצאה של הרגל. בקבוק מים וחטיף מהבית בתיק חוסכים את רובם.',
  },
  {
    id: 'small-pause', art: 'tip-card', when: (f) => f.manySmallCharges,
    title: 'רגע לפני שמעבירים כרטיס',
    body: 'שאלה קצרה לפני קנייה קטנה — "הייתי קונה את זה גם במזומן?" — עוזרת לעצור קניות אוטומטיות.',
  },
  {
    id: 'small-weekly-look', art: 'tip-receipt', when: (f) => f.manySmallCharges,
    title: 'מבט שבועי',
    body: 'חמש דקות בשבוע מול רשימת החיובים מספיקות כדי לזהות הרגל קטן שמתחיל לעלות כסף.',
  },

  // --- A negative forecast ---------------------------------------------------
  {
    id: 'neg-three-cuts', art: 'tip-bulb', when: (f) => f.forecastNegative,
    title: 'שלושה דברים קטנים',
    body: 'כשהתחזית לסוף החודש שלילית, לא צריך לשנות הכול. מספיק לבחור שלוש הוצאות שאפשר לדחות או לוותר עליהן החודש.',
    next: 'פתחו את ההוצאות המשתנות ובחרו שלוש הוצאות לדחות לחודש הבא.',
  },
  {
    id: 'neg-postpone', art: 'tip-calendar', when: (f) => f.forecastNegative,
    title: 'מה שיכול לחכות',
    body: 'קנייה גדולה שאינה דחופה יכולה לחכות לחודש הבא, אחרי שתיכנס המשכורת. כך החודש הזה לא נגמר במינוס עמוק יותר.',
  },
  {
    id: 'neg-talk', art: 'tip-bulb', when: (f) => f.forecastNegative,
    title: 'שיחה של עשר דקות',
    body: 'כשהחודש צפוי להסתיים במינוס, שיחה קצרה ביחד על מה עוד צפוי לצאת עדיפה על הפתעה בסוף החודש.',
  },
  {
    id: 'neg-sell', art: 'tip-jar', when: (f) => f.forecastNegative,
    title: 'מה עומד בלי שימוש?',
    body: 'עגלה, ריהוט או ציוד ספורט שעומדים בבית בלי שימוש אפשר למכור ביד שנייה ולהכניס קצת כסף לחודש.',
  },
  {
    id: 'neg-overdraft', art: 'tip-receipt', when: (f) => f.forecastNegative,
    title: 'מינוס עולה כסף',
    body: 'יתרה שלילית בעו״ש עולה ריבית על כל יום שהיא נמשכת. גם לצמצם את המינוס בכמה ימים חוסך.',
  },
  {
    id: 'neg-no-spend-days', art: 'tip-calendar', when: (f) => f.forecastNegative,
    title: 'ימים בלי הוצאות',
    body: 'קבעו יומיים בשבוע שבהם לא קונים שום דבר חוץ מההכרחי. זה משחק קטן שעוזר לסגור את החודש.',
  },

  // --- A positive forecast ---------------------------------------------------
  {
    id: 'pos-set-aside', art: 'tip-jar', when: (f) => f.forecastPositive,
    title: 'לשים בצד עכשיו',
    body: 'התחזית לסוף החודש חיובית. כסף שעובר הצידה מוקדם נוטה להישאר שם יותר מכסף שנשאר "אם יישאר".',
    next: 'החליטו על סכום קטן להעביר הצידה כבר השבוע.',
  },
  {
    id: 'pos-cushion', art: 'tip-jar', when: (f) => f.forecastPositive,
    title: 'כרית ביטחון',
    body: 'סכום בצד בגובה כמה חודשי הוצאות מאפשר לעבור תיקון ברכב או חודש חלש בלי להיכנס למינוס.',
  },
  {
    id: 'pos-named-goal', art: 'tip-jar', when: (f) => f.forecastPositive,
    title: 'לחיסכון יש שם',
    body: 'חיסכון עם מטרה — חופשה, מכונת כביסה, מתנה לחג — קל יותר לשמור מאשר "חיסכון" כללי.',
  },
  {
    id: 'pos-celebrate', art: 'tip-plant', when: (f) => f.forecastPositive,
    title: 'מותר לשמוח',
    body: 'חודש שנגמר בפלוס הוא הישג. אפשר לחגוג אותו בקטן, ולהשאיר את רוב העודף בצד.',
  },

  // --- Cash ------------------------------------------------------------------
  {
    id: 'cash-negative', art: 'tip-jar', when: (f) => f.cashNegative,
    title: 'ארנק במינוס?',
    body: 'בארנק אמיתי אין מינוס, אז כנראה חסרה רשומה: משיכה מהכספומט או כסף שקיבלתם.',
    next: 'בדקו אם הייתה משיכה או הכנסה במזומן שלא נרשמה, והוסיפו אותה.',
  },
  {
    id: 'cash-count', art: 'tip-jar', when: (f) => f.cashNegative || f.cashUsedOften,
    title: 'לספור את הארנק',
    body: 'מדי פעם כדאי לספור את המזומן ולעדכן כאן את היתרה, כדי שהמספרים יתאימו למה שבאמת יש.',
  },
  {
    id: 'cash-envelopes', art: 'tip-jar', when: (f) => f.cashUsedOften,
    title: 'מעטפות מזומן',
    body: 'שיטת המעטפות — סכום קבוע במזומן לאוכל, ליציאות ולשונות — עוזרת לראות בכל רגע כמה נשאר בכל אחת.',
  },
  {
    id: 'cash-log-now', art: 'tip-receipt', when: (f) => f.cashUsedOften,
    title: 'לרשום מיד',
    body: 'הוצאה במזומן שלא נרשמת נשכחת תוך יום. הודעה קצרה לבוט מיד אחרי הקנייה שומרת על תמונה מלאה.',
  },

  // --- Salary came in --------------------------------------------------------
  {
    id: 'salary-first', art: 'tip-jar', when: (f) => f.salaryJustArrived,
    title: 'קודם לעצמכם',
    body: 'המשכורת נכנסה. זה הרגע הכי טוב להעביר סכום קבוע הצידה, לפני שהכסף מתפזר על החודש.',
    next: 'קבעו סכום שעובר הצידה בכל חודש, ביום שאחרי המשכורת.',
  },
  {
    id: 'salary-fixed', art: 'tip-calendar', when: (f) => f.salaryJustArrived,
    title: 'קודם הקבועות',
    body: 'כשהמשכורת נכנסת, כדאי לוודא שיש בעו״ש מספיק לשכר הדירה, לארנונה ולחשבונות של החודש לפני קניות אחרות.',
  },
  {
    id: 'salary-payslip', art: 'tip-receipt', when: (f) => f.salaryJustArrived,
    title: 'מבט בתלוש',
    body: 'שווה לעבור על תלוש השכר: שעות נוספות, נסיעות, ימי חופשה ונקודות זיכוי. טעויות בתלוש קורות יותר משחושבים.',
  },
  {
    id: 'salary-wait', art: 'tip-calendar', when: (f) => f.salaryJustArrived,
    title: 'יום המשכורת',
    body: 'ביום שהמשכורת נכנסת קל להרגיש עשירים. דחו קנייה גדולה בכמה ימים, ותראו אם היא עדיין נחוצה.',
  },
  {
    id: 'salary-credit-points', art: 'tip-receipt', when: (f) => f.salaryJustArrived,
    title: 'נקודות זיכוי',
    body: 'הורים לילדים קטנים, חיילים משוחררים, עולים ובעלי תואר זכאים לעיתים לנקודות זיכוי במס. שווה לבדוק שהן מופיעות בתלוש.',
  },

  // --- Weekends --------------------------------------------------------------
  {
    id: 'weekend-plan', art: 'tip-calendar', when: (f) => f.weekendHeavy,
    title: 'סוף שבוע מתוכנן',
    body: 'החודש חלק גדול מההוצאות היה בשישי ושבת. סוף שבוע עם תוכנית — טיול, פיקניק, אירוח — עולה בדרך כלל פחות מ"נראה מה יהיה".',
  },
  {
    id: 'weekend-free', art: 'tip-plant', when: (f) => f.weekendHeavy,
    title: 'בילוי בלי קופה',
    body: 'פארקים, חופים, מסלולי הליכה והספרייה העירונית — יש הרבה בילוי טוב בחינם בסוף השבוע.',
  },
  {
    id: 'weekend-thursday', art: 'tip-cart', when: (f) => f.weekendHeavy,
    title: 'הקניות של חמישי',
    body: 'קניות לשבת ביום חמישי, עם רשימה, חוסכות את הקפיצה לחנות היקרה של שישי בצהריים.',
  },

  // --- Subscriptions ---------------------------------------------------------
  {
    id: 'subs-review', art: 'tip-receipt', when: (f) => f.subscriptions >= 2,
    title: 'מנויים קטנים',
    body: 'יש לכם כמה מנויים חודשיים. כל אחד קטן, אבל יחד הם הוצאה קבועה. מה מהם באמת בשימוש?',
    next: 'עברו על ההוצאות הקבועות ובחרו מנוי אחד לבטל או להקפיא.',
  },
  {
    id: 'subs-trial', art: 'tip-calendar', when: (f) => f.subscriptions >= 1,
    title: 'תקופת ניסיון',
    body: 'תקופת ניסיון בחינם הופכת למנוי בתשלום ביום שהיא נגמרת. כשנרשמים, שימו תזכורת ליום שלפני.',
  },
  {
    id: 'subs-double', art: 'tip-receipt', when: (f) => f.subscriptions >= 2,
    title: 'כפילויות בבית',
    body: 'קורה ששני בני הזוג משלמים כל אחד על אותו שירות. מנוי אחד משותף לבית חוסך את הכפל.',
  },
  {
    id: 'subs-rotate', art: 'tip-calendar', when: (f) => f.subscriptions >= 2,
    title: 'מנוי בתורות',
    body: 'אפשר להחזיק שירות צפייה אחד בכל פעם ולהחליף כל כמה חודשים, במקום לשלם על כולם יחד.',
  },

  // --- Fees ------------------------------------------------------------------
  {
    id: 'fees-check', art: 'tip-receipt', when: (f) => f.feesSeen,
    title: 'עמלות בחשבון',
    body: 'החודש נגבו עמלות. את רוב פעולות הבנק אפשר לעשות באפליקציה או באתר, בעמלה נמוכה יותר מאשר מול פקיד.',
    next: 'פתחו את פירוט העמלות באתר הבנק ובדקו על מה שילמתם.',
  },
  {
    id: 'fees-ask', art: 'tip-receipt', when: (f) => f.feesSeen,
    title: 'לבקש הנחה',
    body: 'מותר לבקש מהבנק הנחה בעמלות. שיחה קצרה עם הסניף או המוקד מסתיימת לא פעם בהנחה.',
  },
  {
    id: 'fees-card', art: 'tip-card', when: (f) => f.feesSeen,
    title: 'דמי כרטיס',
    body: 'יש כרטיסי אשראי שגובים דמי כרטיס חודשיים. שווה לשאול את חברת האשראי אם אפשר לוותר עליהם.',
  },
  {
    id: 'fees-yearly', art: 'tip-receipt', when: (f) => f.feesSeen,
    title: 'הדוח השנתי',
    body: 'כל בנק שולח פעם בשנה ריכוז של העמלות ששילמתם. מבט בו מראה על מה אתם משלמים בלי לשים לב.',
  },

  // --- Installments ----------------------------------------------------------
  {
    id: 'inst-sum', art: 'tip-card', when: (f) => f.installments >= 2,
    title: 'תשלומים שמצטברים',
    body: 'כמה רכישות בתשלומים רצות במקביל. כל תשלום קטן, אבל יחד הם נוגסים בכל משכורת עד שייגמרו.',
    next: 'סכמו כמה יוצא כל חודש על תשלומים, ועד מתי.',
  },
  {
    id: 'inst-overlap', art: 'tip-calendar', when: (f) => f.installments >= 2,
    title: 'לפני עוד תשלומים',
    body: 'לפני רכישה חדשה בתשלומים, כדאי לבדוק מתי נגמרים הקודמים, כדי שלא יחפפו.',
  },
  {
    id: 'inst-total', art: 'tip-card', when: (f) => f.installments >= 1,
    title: 'המחיר הכולל',
    body: 'לא כל עסקת תשלומים היא בלי ריבית. לפני שמחלקים, שאלו אם המחיר הכולל זהה למחיר בתשלום אחד.',
  },

  // --- Deliveries, coffee, fuel ----------------------------------------------
  {
    id: 'deliv-fees', art: 'tip-cup', when: (f) => f.deliveries >= 3,
    title: 'מה עולה המשלוח',
    body: 'החודש היו כמה משלוחי אוכל. דמי משלוח, דמי שירות ומינימום הזמנה מוסיפים לא מעט לכל ארוחה.',
  },
  {
    id: 'deliv-pickup', art: 'tip-cup', when: (f) => f.deliveries >= 3,
    title: 'איסוף עצמי',
    body: 'באיסוף עצמי מהמסעדה חוסכים את דמי המשלוח, ולפעמים מקבלים גם הנחה.',
  },
  {
    id: 'deliv-freezer', art: 'tip-cup', when: (f) => f.deliveries >= 3,
    title: 'ארוחה מהמקפיא',
    body: 'מגש מוכן במקפיא לערבים העמוסים הוא התחליף הכי זול למשלוח.',
  },
  {
    id: 'coffee-home', art: 'tip-cup', when: (f) => f.coffees >= 4,
    title: 'קפה מהבית',
    body: 'קפה בדרך כל יום מצטבר למאות שקלים בחודש. כוס תרמית מהבית בחלק מהימים חוסכת חלק גדול מזה.',
  },
  {
    id: 'coffee-punch', art: 'tip-cup', when: (f) => f.coffees >= 4,
    title: 'בית הקפה הקבוע',
    body: 'אם יש בית קפה קבוע, שאלו על כרטיסייה. לא פעם כל כוס עשירית בחינם.',
  },
  {
    id: 'fuel-self', art: 'tip-receipt', when: (f) => f.fuel >= 3,
    title: 'מחיר הדלק',
    body: 'מחיר הבנזין בישראל הוא מחיר מקסימום, ובתחנות רבות זול ממנו. שירות עצמי זול יותר משירות מלא.',
  },
  {
    id: 'fuel-tires', art: 'tip-bulb', when: (f) => f.fuel >= 3,
    title: 'אוויר בצמיגים',
    body: 'צמיגים עם לחץ אוויר נמוך מעלים את צריכת הדלק. בדיקה פעם בחודש לוקחת שתי דקות.',
  },
  {
    id: 'fuel-combine', art: 'tip-calendar', when: (f) => f.fuel >= 3,
    title: 'נסיעה אחת לכמה סידורים',
    body: 'סידורים שמתוכננים יחד לנסיעה אחת חוסכים דלק וזמן.',
  },

  // --- A big charge, the month's rhythm, trackers ----------------------------
  {
    id: 'big-balance', art: 'tip-bulb', when: (f) => f.bigCharge,
    title: 'אחרי הוצאה גדולה',
    body: 'הייתה החודש הוצאה גדולה. כדאי להוריד קצת מהוצאות אחרות עד סוף החודש, כדי שהיא לא תגרור את החודש למינוס.',
  },
  {
    id: 'big-48h', art: 'tip-calendar', when: (f) => f.bigCharge,
    title: 'כלל 48 השעות',
    body: 'לפני רכישה גדולה, חכו יומיים. אם אחרי 48 שעות היא עדיין נראית נכונה, כנראה שהיא באמת כזו.',
  },
  {
    id: 'start-goal', art: 'tip-plant', when: (f) => f.monthStart,
    title: 'חודש חדש',
    body: 'חודש חדש התחיל. זה הזמן לעבור על התחזית, לראות מה צפוי לצאת ולבחור יעד אחד לחודש.',
    next: 'בחרו קטגוריה אחת שתרצו להוריד בה החודש.',
  },
  {
    id: 'start-bimonthly', art: 'tip-calendar', when: (f) => f.monthStart,
    title: 'חשבונות של חודשיים',
    body: 'חשמל ומים מגיעים בדרך כלל פעם בחודשיים. כדאי לזכור אותם מראש, כדי שלא יפתיעו בחודש שבו הם יורדים.',
  },
  {
    id: 'start-events', art: 'tip-calendar', when: (f) => f.monthStart,
    title: 'מה מיוחד החודש?',
    body: 'ימי הולדת, חגים, אירועים ומתנות — כדאי לרשום אותם בתחילת החודש ולהשאיר להם מקום בתקציב.',
  },
  {
    id: 'end-review', art: 'tip-bulb', when: (f) => f.monthEnd,
    title: 'סיכום חודש',
    body: 'החודש מתקרב לסופו. רגע של סיכום — מה עבד ומה יצא יקר מהצפוי — עוזר לתכנן טוב יותר את הבא.',
  },
  {
    id: 'end-hold', art: 'tip-calendar', when: (f) => f.monthEnd,
    title: 'השבוע האחרון',
    body: 'בימים האחרונים של החודש כדאי לדחות קניות שאינן דחופות לתחילת החודש הבא.',
  },
  {
    id: 'end-pantry', art: 'tip-cart', when: (f) => f.monthEnd,
    title: 'שבוע מהמזווה',
    body: 'בסוף החודש נסו לבשל בעיקר ממה שכבר יש בבית. זה חוסך, ומפנה מקום לקניות החדשות.',
  },
  {
    id: 'tracker-real-target', art: 'tip-plant', when: (f) => f.anyTrackerOver,
    title: 'יעד שמתאים לחיים',
    body: 'אם קטגוריה עוברת את היעד חודש אחרי חודש, אולי היעד לא מציאותי. עדיף יעד אמיתי ממספר שתמיד נשבר.',
  },

  // --- For every household ---------------------------------------------------
  {
    id: 'gen-one-look', art: 'tip-bulb',
    title: 'מבט אחד ביום',
    body: 'מבט קצר בתחזית לסוף החודש פעם ביום מספיק כדי לדעת איפה אתם עומדים, בלי לנהל גיליון.',
  },
  {
    id: 'gen-wishlist', art: 'tip-receipt',
    title: 'רשימת משאלות',
    body: 'כשמשהו מתחשק, רשמו אותו ברשימה במקום לקנות. אחרי שבועיים חלק גדול מהרשימה כבר לא נראה חשוב.',
    next: 'פתחו פתק משותף בטלפון בשם "אולי נקנה".',
  },
  {
    id: 'gen-newsletters', art: 'tip-bulb',
    title: 'פחות פרסומות',
    body: 'הסרה מרשימות הדיוור של חנויות מורידה את הפיתוי. מה שלא רואים, לא מתחשק.',
  },
  {
    id: 'gen-event-gifts', art: 'tip-jar',
    title: 'מתנות לאירועים',
    body: 'חתונות, בריתות ובר מצוות הן הוצאה גדולה. סכום קבוע מראש לכל סוג אירוע חוסך התלבטות ברגע האחרון.',
  },
  {
    id: 'gen-holidays', art: 'tip-calendar',
    title: 'החגים בדרך',
    body: 'חגי תשרי ופסח הם חודשים יקרים: אירוח, מתנות ובגדים. סכום קטן שנשמר מכל חודש לקראתם מרכך את הקפיצה.',
  },
  {
    id: 'gen-phone-plan', art: 'tip-receipt',
    title: 'חבילת הסלולר',
    body: 'מחירי חבילות הסלולר ירדו מאוד בשנים האחרונות. אם החבילה שלכם ותיקה, ייתכן שאתם משלמים יותר מהנדרש.',
    next: 'בדקו כמה אתם משלמים היום על כל קו, והשוו למחיר של חבילה חדשה.',
  },
  {
    id: 'gen-internet-tv', art: 'tip-receipt',
    title: 'אינטרנט וטלוויזיה',
    body: 'שיחה לחברת האינטרנט או הטלוויזיה עם בקשה למחיר עדכני מסתיימת לא פעם בהנחה.',
  },
  {
    id: 'gen-insurance-twice', art: 'tip-receipt',
    title: 'משלמים פעמיים?',
    body: 'קורה שמשלמים על אותו כיסוי ביטוחי פעמיים, למשל דרך מקום העבודה וגם בנפרד. שווה לבדוק אילו ביטוחים יש לכם.',
  },
  {
    id: 'gen-electricity', art: 'tip-bulb',
    title: 'חשבון החשמל',
    body: 'דוד שמש במקום דוד חשמלי, מזגן על 24 מעלות וכיבוי מכשירים שעומדים בהמתנה מורידים את חשבון החשמל.',
  },
  {
    id: 'gen-water', art: 'tip-plant',
    title: 'חסכמי מים',
    body: 'חסכם מים לברז ולמקלחת זול ופשוט להתקנה, ומוריד את חשבון המים לאורך זמן.',
  },
  {
    id: 'gen-second-hand', art: 'tip-jar',
    title: 'יד שנייה',
    body: 'ריהוט, ציוד לתינוקות וספרים במצב מצוין נמכרים ביד שנייה בחלק קטן מהמחיר.',
  },
  {
    id: 'gen-borrow', art: 'tip-plant',
    title: 'לשאול במקום לקנות',
    body: 'כלי עבודה, ציוד קמפינג או עגלה לטיול — לפעמים שכנים או חברים ישמחו להשאיל לכמה ימים.',
  },
  {
    id: 'gen-kids-activities', art: 'tip-calendar',
    title: 'חוגים וצהרונים',
    body: 'חוגים, צהרונים וקייטנות הם הוצאה גדולה במשפחות. כדאי לשאול על הנחת אחים או על חוגים דרך המתנ״ס.',
  },
  {
    id: 'gen-health-fund', art: 'tip-plant',
    title: 'קופת החולים',
    body: 'הביטוח המשלים של קופת החולים נותן לרוב החזר על משקפיים, טיפולי שיניים או פיזיותרפיה. כדאי לבדוק לפני שמשלמים מחיר מלא.',
  },
  {
    id: 'gen-receipts', art: 'tip-receipt',
    title: 'קבלות במקום אחד',
    body: 'קבלות על טיפולים, תרופות ותרומות יכולות להחזיר כסף מקופת החולים או ממס הכנסה. שמרו אותן במקום אחד.',
  },
  {
    id: 'gen-tax-refund', art: 'tip-receipt',
    title: 'החזר מס',
    body: 'שכירים רבים זכאים להחזר מס בלי לדעת, למשל אחרי החלפת עבודה באמצע שנה או תרומות. אפשר לבקש עד שש שנים אחורה.',
  },
  {
    id: 'gen-car-cost', art: 'tip-receipt',
    title: 'העלות האמיתית של הרכב',
    body: 'רכב עולה הרבה מעבר לדלק: ביטוח, טסט, טיפולים, חניה וירידת ערך. כדאי לחשב פעם אחת את הסכום החודשי המלא.',
  },
  {
    id: 'gen-public-transport', art: 'tip-calendar',
    title: 'תחבורה ציבורית',
    body: 'בנסיעות קבועות לעבודה, כרטיס חופשי חודשי יכול לעלות פחות מדלק וחניה.',
  },
  {
    id: 'gen-three-quotes', art: 'tip-receipt',
    title: 'שלוש הצעות מחיר',
    body: 'לפני הוצאה גדולה — שיפוץ, מוצר חשמל, טיפול שיניים — שלוש הצעות מחיר חוסכות לא פעם מאות שקלים.',
  },
  {
    id: 'gen-ask-price', art: 'tip-cart',
    title: 'מותר לשאול',
    body: 'בחנויות רבות אפשר לשאול אם יש מחיר טוב יותר, במיוחד בקנייה של כמה פריטים יחד.',
  },
  {
    id: 'gen-cancel-online', art: 'tip-card',
    title: '14 יום להתחרט',
    body: 'בקנייה באינטרנט או בטלפון אפשר בדרך כלל לבטל עסקה תוך 14 יום. מוצר שלא מתאים כדאי להחזיר בזמן.',
  },
  {
    id: 'gen-money-night', art: 'tip-plant',
    title: 'ערב כספים זוגי',
    body: 'פעם בחודש, חצי שעה ביחד מול האפליקציה. לא כדי לריב — כדי להחליט יחד מה חשוב לכם.',
    next: 'קבעו ערב קבוע בחודש, עם תה ועוגה.',
  },
  {
    id: 'gen-one-habit', art: 'tip-plant',
    title: 'הרגל אחד',
    body: 'שינוי קטן אחד שמחזיק עדיף על חמישה שנזנחים אחרי שבוע. בחרו הרגל אחד לחודש הזה.',
  },
  {
    id: 'gen-round', art: 'tip-bulb',
    title: 'לעגל נכון',
    body: 'כשמתכננים, עגלו את ההוצאות למעלה ואת ההכנסות למטה. כך ההפתעות בדרך כלל טובות.',
  },
  {
    id: 'gen-cart-wait', art: 'tip-cart',
    title: 'עגלה שמחכה ליום',
    body: 'בקנייה באינטרנט, השאירו את העגלה עד מחר. הרבה פעמים למחרת כבר לא צריך חצי ממה שבה.',
  },
  {
    id: 'gen-kids-clothes', art: 'tip-jar',
    title: 'בגדים לילדים',
    body: 'ילדים גדלים מהר. בגדים ממשפחה, מחברים או מיד שנייה משרתים לרוב בדיוק כמו חדשים.',
  },
  {
    id: 'gen-pocket-money', art: 'tip-jar',
    title: 'סכום חופשי לכל אחד',
    body: 'סכום קבוע בשבוע לכל אחד מכם, להוציא בלי לתת דין וחשבון, מוריד חיכוכים ושומר על התקציב.',
  },
  {
    id: 'gen-card-alerts', art: 'tip-card',
    title: 'התראה על כל חיוב',
    body: 'התראה בטלפון על כל חיוב בכרטיס עוזרת לזהות מהר חיוב שגוי או כפול.',
  },
  {
    id: 'gen-unknown-charge', art: 'tip-card',
    title: 'חיוב שלא מכירים',
    body: 'שם עסק לא מוכר בפירוט הוא לרוב שם החברה שמאחורי החנות. אם לא מזהים אותו, כדאי לברר עם חברת האשראי.',
  },
  {
    id: 'gen-fixed-quarterly', art: 'tip-calendar',
    title: 'קבועה אחת ברבעון',
    body: 'בהוצאות הקבועות חיסכון אחד עובד כל חודש מחדש. בדקו לעומק הוצאה קבועה אחת בכל רבעון.',
  },
  {
    id: 'gen-date-home', art: 'tip-cup',
    title: 'ערב זוגי בבית',
    body: 'ארוחה טובה וסרט בבית, בלי בייביסיטר — לפעמים זה בדיוק מה שצריך, בחלק מהמחיר.',
  },
  {
    id: 'gen-library', art: 'tip-plant',
    title: 'הספרייה העירונית',
    body: 'ספריות עירוניות משאילות ספרים, ובחלקן גם משחקים וסרטים, בחינם או כמעט.',
  },
  {
    id: 'gen-birthday', art: 'tip-cup',
    title: 'יום הולדת בפארק',
    body: 'מסיבת יום הולדת בבית או בפארק יכולה להיות כיפית לא פחות ממקום מוזמן, בחלק מהעלות.',
  },
  {
    id: 'gen-generic-medicine', art: 'tip-plant',
    title: 'תרופה גנרית',
    body: 'לתרופות רבות יש גרסה גנרית עם אותו חומר פעיל, במחיר נמוך יותר. אפשר לשאול את הרוקח.',
  },
  {
    id: 'gen-standing-orders', art: 'tip-receipt',
    title: 'הוראות קבע',
    body: 'פעם בשנה כדאי לעבור על כל הוראות הקבע בבנק ובכרטיס, ולבטל את מה שכבר לא בשימוש.',
  },
  {
    id: 'gen-cooking-gas', art: 'tip-bulb',
    title: 'מכסה על הסיר',
    body: 'מכסה על הסיר ולהבה בגודל הסיר חוסכים גז וחשמל בלי לשנות שום דבר בבישול.',
  },
  {
    id: 'gen-sales-season', art: 'tip-calendar',
    title: 'לקנות בעונה',
    body: 'פירות וירקות בעונה שלהם זולים וטעימים יותר. מעיל קונים בסוף החורף, לא בתחילתו.',
  },
  {
    id: 'gen-gift-cards', art: 'tip-card',
    title: 'תווי קנייה במגירה',
    body: 'תווי קנייה ושוברי מתנה נשכחים במגירה ופגים. אספו אותם למקום אחד ותשתמשו בהם בקנייה הבאה.',
  },
  {
    id: 'gen-repair', art: 'tip-bulb',
    title: 'לתקן לפני שמחליפים',
    body: 'מכשיר שהתקלקל, נעל שנקרעה או רוכסן שנתקע — תיקון עולה לרוב הרבה פחות ממוצר חדש.',
  },
  {
    id: 'gen-clubs', art: 'tip-card',
    title: 'מועדון שכבר יש לכם',
    body: 'מקום העבודה, ועד העובדים או ארגון שאתם חברים בו מציעים לא פעם הנחות. שווה לבדוק לפני קנייה גדולה.',
  },
  {
    id: 'gen-vacation-early', art: 'tip-calendar',
    title: 'חופשה מוקדם',
    body: 'טיסות וחופשות שמזמינים מוקדם, מחוץ לחגים ולחופשים, זולות בהרבה.',
  },
  {
    id: 'gen-shared-goal', art: 'tip-jar',
    title: 'מטרה משותפת',
    body: 'כששניכם יודעים בשביל מה חוסכים, קל יותר לוותר על הקטנות. דברו פעם על מטרה אחת לשנה הקרובה.',
  },
  {
    id: 'gen-thank-progress', art: 'tip-plant',
    title: 'לראות את ההתקדמות',
    body: 'השוו את החודש לחודש שעבר. גם שיפור קטן בקטגוריה אחת הוא סימן שזה עובד.',
  },
];

// ---------------------------------------------------------------------------
// Picking today's tips
// ---------------------------------------------------------------------------

const tipKey = (tip: Tip) => `tip:${tip.id}`;

function firstShownOn(feedback: InsightFeedback, key: string): string | null {
  const seenAt = feedback.get(key)?.seenAt;
  return seenAt ? isoDateInIsrael(new Date(seenAt)) : null;
}

/**
 * Up to `count` tips for today. Tips first shown today stay all day (unless
 * opened or dismissed) and fill today's quota, so closing one does not pull in
 * another. Otherwise: tips never shown before whose condition holds — the ones
 * about the household's own numbers first, then general ones, each in library
 * order. A tip shown on an earlier day never comes back.
 */
export function selectTips(library: Tip[], facts: TipFacts, feedback: InsightFeedback, today: string, count: number): Tip[] {
  const shownToday = library.filter((t) => firstShownOn(feedback, tipKey(t)) === today);
  const keep = shownToday.filter((t) => stillShowable(tipKey(t), feedback, today));
  const room = count - shownToday.length;
  if (room <= 0) return keep.slice(0, count);

  const fresh = library.filter((t) => !feedback.has(tipKey(t)) && (!t.when || t.when(facts)));
  const ordered = [...fresh.filter((t) => t.when), ...fresh.filter((t) => !t.when)];
  return [...keep, ...ordered.slice(0, room)];
}

/** A tip as a card in the carousel. */
export function tipInsight(tip: Tip): Insight {
  return {
    key: tipKey(tip),
    kind: 'tip',
    art: tip.art,
    title: tip.title,
    body: [tip.body],
    detail: { heading: tip.title, paragraphs: [[tip.body]], next: tip.next ? [tip.next] : [] },
    helpful: null,
  };
}

/** Data cards first, then one or two tips: two when the data has little to say. */
export function withTips(cards: Insight[], input: InsightInput, feedback: InsightFeedback, library: Tip[] = TIPS): Insight[] {
  const count = cards.length >= 3 ? 1 : 2;
  return [...cards, ...selectTips(library, tipFacts(input), feedback, input.today, count).map(tipInsight)];
}
