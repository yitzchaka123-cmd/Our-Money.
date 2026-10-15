/**
 * Fixed charges and trackers shaped like the real RiseUp budget: one `fixed`
 * envelope per charge (some not charged yet), trackers named only by id, and
 * a grocery tracker split into weekly parts. They go through the same
 * `assembleMonth` the live dashboard uses, so the preview shows the merged
 * card, the names and the order exactly as the app would.
 */

import { assembleMonth, type ActualRow, type EnvelopeRow, type EnvelopeView } from '../lib/dashboard/data';
import { buildNameBook } from '../lib/riseup/tracker-names';

type Charge = [key: string, planned: number, actual: number, label: string, business: string, day: number];

/** [key, planned, charged, category, merchant, day]; charged 0 = still expected. */
const FIXED: Charge[] = [
  ['f01', 1842.36, 1821.85, 'הלוואה', 'בנק לאומי הלוואה', 2],
  ['f02', 682.8, 768.99, 'חשמל', 'חברת החשמל', 4],
  ['f03', 684, 684, 'תשלומים', 'איקאה', 3],
  ['f04', 465, 465, 'תשלומים', 'מחסני חשמל', 3],
  ['f05', 214.92, 214.92, 'תשלומים', 'KSP', 5],
  ['f06', 195, 193, 'תשלומים', 'שופרסל אונליין', 6],
  ['f07', 114, 114, 'תשלומים', 'פרטנר', 6],
  ['f08', 74.79, 75.29, 'ביטוח', 'הראל ביטוח', 8],
  ['f09', 50.69, 50.69, 'דיגיטל', 'Spotify', 9],
  ['f10', 50, 50, 'כללי', 'הוראת קבע', 10],
  ['f11', 567, 0, 'ביטוח לאומי', 'ביטוח לאומי', 0],
  ['f12', 266, 0, 'ביטוח לאומי', 'ביטוח לאומי', 0],
  ['f13', 257.44, 0, 'תקשורת', 'בזק', 0],
  ['f14', 184.03, 0, 'בריאות', 'מכבי', 0],
  ['f15', 129.68, 0, 'בריאות', 'מכבי שיניים', 0],
  ['f16', 103.05, 0, 'בריאות', 'מכבי שלי', 0],
  ['f17', 98.99, 0, 'דיגיטל', 'Netflix', 0],
  ['f18', 86, 0, 'תקשורת', 'הוט מובייל', 0],
  ['f19', 84.21, 0, 'ביטוח', 'מגדל', 0],
  ['f20', 55, 0, 'RiseUp', 'רייזאפ', 0],
  ['f21', 57.4, 0, 'דיגיטל', 'Google One', 0],
  ['f22', 33.9, 0, 'דיגיטל', 'Apple', 0],
  ['f23', 11.68, 0, 'כללי', 'עמלת ערוץ', 0],
  ['f24', 0, 0, 'כללי', 'ללא תכנון', 0],
];

type Tracker = [key: string, planned: number, spends: Array<[amount: number, day: number, business: string]>, label: string | null];

const TRACKERS: Tracker[] = [
  ['v2-default-il-expense-category-13', 2850, [[4.27, 7, 'פז']], 'רכב'],
  ['v2-default-il-expense-category-33', 450, [[71, 9, 'סופר-פארם']], 'פארמה'],
  ['v2-default-il-expense-category-28', 200, [], null],
  ['v2-default-il-expense-category-9', 600, [[74, 11, 'מסעדת הגליל'], [41, 4, 'ארומה']], 'אוכל בחוץ'],
  ['v2-default-il-expense-category-16', 0, [[8.25, 3, 'עמלת פעולה']], 'עמלות'],
  // A custom tracker RiseUp never named and nothing was charged to yet.
  ['v2-62d571eb339d9fa51c3091c6', 0, [], null],
];

/** כלכלה, split by RiseUp into one envelope per calendar week. */
const GROCERY_WEEKS: Array<Array<[number, number, string]>> = [
  [[211.12, 3, 'שופרסל דיל']],
  [[80.4, 9, 'רמי לוי']],
  [[1892.6, 14, 'שופרסל אונליין']],
  [[335.61, 21, 'יוחננוף']],
  [],
];

export function realMonthEnvelopes(month: string): EnvelopeView[] {
  const envelopeRows: EnvelopeRow[] = [];
  const actualRows: ActualRow[] = [];
  const day = (d: number) => `${month}-${String(d).padStart(2, '0')}`;
  const actual = (envelopeId: string, id: string, amount: number, d: number, business: string, label: string | null): ActualRow => ({
    envelope_id: envelopeId,
    transaction_id: id,
    transaction_date: day(d),
    billing_date: day(d),
    business_name: business,
    amount_ils: amount,
    is_income: false,
    account_nickname: null,
    account_number_hash: 'cc5910',
    source: null,
    is_installment: false,
    payment_number: null,
    total_payments: null,
    category_label: label,
  });

  FIXED.forEach(([key, planned, charged, label, business, d], index) => {
    const id = `${month}#fixed#${key}`;
    envelopeRows.push({ envelope_id: id, envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: planned, position: index });
    if (charged > 0) actualRows.push(actual(id, `fx-${key}`, charged, d, business, label));
  });

  TRACKERS.forEach(([key, planned, spends, label], index) => {
    const id = `${month}#trackingCategory#${key}`;
    envelopeRows.push({ envelope_id: id, envelope_type: 'trackingCategory', name: id, planned_ils: planned, position: 100 + index });
    spends.forEach(([amount, d, business], n) => actualRows.push(actual(id, `tr-${key}-${n}`, amount, d, business, label)));
  });

  GROCERY_WEEKS.forEach((spends, week) => {
    const id = `${month}#trackingCategory#v2-default-il-expense-category-2#${week}`;
    envelopeRows.push({ envelope_id: id, envelope_type: 'trackingCategory', name: id, planned_ils: 500, position: 90 + week });
    spends.forEach(([amount, d, business], n) => actualRows.push(actual(id, `gr-${week}-${n}`, amount, d, business, 'כלכלה')));
  });

  // The salary, marked "fixed income" in RiseUp: one more `fixed` envelope
  // whose charge is income (V2-19) — it shows as "הכנסות קבועות".
  const salary = `${month}#fixed#c6b3e219-c39f-11f1-b563-8dcdf033ade8`;
  envelopeRows.push({ envelope_id: salary, envelope_type: 'fixed', name: 'הוצאות קבועות', planned_ils: 7635, position: 50 });
  actualRows.push({
    ...actual(salary, 'fx-salary', 7635, 8, 'העברת משכורת', 'משכורת'),
    is_income: true,
    source: 'leumiBank',
    account_number_hash: 'c81bcf',
  });

  // What earlier months taught: the still-expected charges' categories.
  const names = buildNameBook({
    envelopes: [],
    actuals: FIXED.filter(([, , charged]) => charged === 0).map(([key, , , label, business]) => ({
      envelope_id: `2026-08#fixed#${key}`,
      category_label: label,
      business_name: business,
      transaction_date: '2026-08-15',
    })),
  });

  return assembleMonth({
    month,
    envelopeRows,
    actualRows,
    spends: [],
    topups: [],
    plans: [],
    skippedPlanIds: new Set(),
    memberNames: new Map(),
    names,
    // Seen mid-month: the weekly grocery tracker counts weeks that are over
    // at what was spent in them (V2-18).
    today: `${month}-15`,
  }).envelopes;
}
