/**
 * Names for cards and bank accounts.
 *
 * RiseUp's API never sends a card or account number. Each transaction carries
 * only `source` (the provider, e.g. "leumicard"), `sourceType`, sometimes a
 * nickname, and `accountNumberHash` — a short opaque code like "cc5910" that
 * tells two accounts apart but means nothing to a person. So an account is
 * shown, in order of preference, as:
 *
 *   1. the couple's own name for it ("כרטיס 0848"), stored in money.account_labels;
 *   2. RiseUp's nickname for it, when RiseUp sends one;
 *   3. the provider's Hebrew name ("לאומי קארד"), numbered when two unnamed
 *      accounts share that provider ("לאומי קארד 1", "לאומי קארד 2", in a
 *      stable order by code) — never the code itself (feedback video 1, item 7).
 *
 * A provider we do not know reads as a plain "כרטיס" or "חשבון בנק", never
 * RiseUp's English id for it.
 *
 * Pure and client-safe: no database here.
 */

export type AccountKind = 'card' | 'bank' | 'unknown';

export interface AccountRef {
  source: string | null;
  hash: string | null;
  nickname?: string | null;
  sourceType?: string | null;
}

export interface AccountLabel {
  source: string;
  accountNumberHash: string;
  label: string;
}

interface Provider {
  name: string;
  kind: AccountKind;
}

/** Keys are normalised: lower case, letters and digits only. */
const PROVIDERS: Record<string, Provider> = {
  // Credit cards
  leumicard: { name: 'לאומי קארד', kind: 'card' },
  max: { name: 'מקס', kind: 'card' },
  maxit: { name: 'מקס', kind: 'card' },
  isracard: { name: 'ישראכרט', kind: 'card' },
  cal: { name: 'כאל', kind: 'card' },
  visacal: { name: 'כאל', kind: 'card' },
  amex: { name: 'אמריקן אקספרס', kind: 'card' },
  americanexpress: { name: 'אמריקן אקספרס', kind: 'card' },
  diners: { name: 'דיינרס', kind: 'card' },
  behatsdaa: { name: 'בהצדעה', kind: 'card' },
  beyahadbishvilha: { name: 'ביחד בשבילך', kind: 'card' },
  // Banks
  leumibank: { name: 'בנק לאומי', kind: 'bank' },
  leumi: { name: 'בנק לאומי', kind: 'bank' },
  poalim: { name: 'בנק הפועלים', kind: 'bank' },
  hapoalim: { name: 'בנק הפועלים', kind: 'bank' },
  poalimbank: { name: 'בנק הפועלים', kind: 'bank' },
  discount: { name: 'בנק דיסקונט', kind: 'bank' },
  discountbank: { name: 'בנק דיסקונט', kind: 'bank' },
  mizrahi: { name: 'מזרחי טפחות', kind: 'bank' },
  mizrahitefahot: { name: 'מזרחי טפחות', kind: 'bank' },
  mercantile: { name: 'בנק מרכנתיל', kind: 'bank' },
  otsar: { name: 'בנק אוצר החייל', kind: 'bank' },
  otsarhahayal: { name: 'בנק אוצר החייל', kind: 'bank' },
  beinleumi: { name: 'הבנק הבינלאומי', kind: 'bank' },
  fibi: { name: 'הבנק הבינלאומי', kind: 'bank' },
  massad: { name: 'בנק מסד', kind: 'bank' },
  yahav: { name: 'בנק יהב', kind: 'bank' },
  jerusalem: { name: 'בנק ירושלים', kind: 'bank' },
  igud: { name: 'בנק איגוד', kind: 'bank' },
  union: { name: 'בנק איגוד', kind: 'bank' },
  onezero: { name: 'וואן זירו', kind: 'bank' },
  pepper: { name: 'פפר', kind: 'bank' },
  pagi: { name: 'בנק פאגי', kind: 'bank' },
  postal: { name: 'בנק הדואר', kind: 'bank' },
  postalbank: { name: 'בנק הדואר', kind: 'bank' },
};

function normalise(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Card, bank, or unknown — from RiseUp's sourceType when it says, else from the provider. */
export function accountKind(source: string | null, sourceType?: string | null): AccountKind {
  const type = normalise(sourceType);
  if (/card|credit/.test(type)) return 'card';
  if (/bank|checking|account|osh/.test(type)) return 'bank';
  return PROVIDERS[normalise(source)]?.kind ?? 'unknown';
}

/** The provider's Hebrew name, or a plain Hebrew description when the provider is unknown. */
export function providerName(source: string | null, sourceType?: string | null): string {
  const known = PROVIDERS[normalise(source)];
  if (known) return known.name;
  const kind = accountKind(source, sourceType);
  if (kind === 'card') return source ? 'כרטיס' : 'כרטיס אשראי';
  if (kind === 'bank') return 'חשבון בנק';
  return 'חשבון';
}

export function accountKey(source: string | null, hash: string | null): string {
  return `${source ?? ''}|${hash ?? ''}`;
}

function labelFor(account: AccountRef, labels: AccountLabel[]): string | null {
  const label = labels.find(
    (l) => l.source === (account.source ?? '') && l.accountNumberHash === (account.hash ?? ''),
  )?.label;
  return label?.trim() || null;
}

function ownName(account: AccountRef, labels: AccountLabel[]): string | null {
  return labelFor(account, labels) ?? (account.nickname?.trim() || null);
}

/**
 * How one account reads everywhere in the app. `siblings` are the other
 * accounts in view, used only to decide whether the provider name alone is
 * enough to tell this one apart: when other accounts with no name of their
 * own share the provider, each gets a number, ordered by code so the same
 * card keeps the same number.
 */
export function accountDisplayName(account: AccountRef, labels: AccountLabel[], siblings: AccountRef[] = []): string {
  const own = ownName(account, labels);
  if (own) return own;

  const provider = providerName(account.source, account.sourceType);
  const twins = new Map<string, AccountRef>([[accountKey(account.source, account.hash), account]]);
  for (const other of siblings) {
    const key = accountKey(other.source, other.hash);
    if (twins.has(key) || ownName(other, labels)) continue;
    if (providerName(other.source, other.sourceType) === provider) twins.set(key, other);
  }
  if (twins.size < 2) return provider;

  const order = [...twins.keys()].sort((a, b) => {
    const [sa, ha] = [twins.get(a)!.source ?? '', twins.get(a)!.hash ?? ''];
    const [sb, hb] = [twins.get(b)!.source ?? '', twins.get(b)!.hash ?? ''];
    return ha < hb ? -1 : ha > hb ? 1 : sa < sb ? -1 : sa > sb ? 1 : 0;
  });
  return `${provider} ${order.indexOf(accountKey(account.source, account.hash)) + 1}`;
}

/**
 * A namer for one view of the data: give it every account the view shows,
 * and it names each one the same way, every time. Rows with no provider and
 * no code (cash, or nothing known) get null.
 */
export function accountNamer(accounts: AccountRef[], labels: AccountLabel[]): (account: AccountRef) => string | null {
  const distinct = new Map<string, AccountRef>();
  for (const a of accounts) {
    if (!a.source && !a.hash) continue;
    const key = accountKey(a.source, a.hash);
    if (!distinct.has(key)) distinct.set(key, a);
  }
  const siblings = [...distinct.values()];
  return (account) => {
    if (account.source === 'cash') return null;
    if (!account.source && !account.hash) return account.nickname?.trim() || null;
    return accountDisplayName(account, labels, siblings);
  };
}

// ---------------------------------------------------------------------------
// The accounts list: every card and bank account seen in the data
// ---------------------------------------------------------------------------

export interface AccountSummary {
  key: string;
  source: string;
  hash: string;
  kind: AccountKind;
  provider: string;
  displayName: string;
  /** The couple's own name, if they gave one. */
  label: string | null;
  nickname: string | null;
  monthCharges: number;
  monthChargeCount: number;
  monthCredits: number;
  monthCreditCount: number;
}

export interface AccountRow extends AccountRef {
  amountIls?: number | string | null;
  isIncome?: boolean | null;
}

/**
 * One summary per account: everything ever seen (`known`) plus this month's
 * charges and credits (`monthRows`). Cards first, then banks, then the rest;
 * busiest first within each.
 */
export function summarizeAccounts({
  known,
  monthRows,
  labels,
}: {
  known: AccountRef[];
  monthRows: AccountRow[];
  labels: AccountLabel[];
}): AccountSummary[] {
  const all = [...known, ...monthRows].filter((a) => a.source !== 'cash' && (a.source || a.hash));
  const name = accountNamer(all, labels);
  const byKey = new Map<string, AccountSummary>();

  const ensure = (a: AccountRef): AccountSummary => {
    const key = accountKey(a.source, a.hash);
    let summary = byKey.get(key);
    if (!summary) {
      summary = {
        key,
        source: a.source ?? '',
        hash: a.hash ?? '',
        kind: accountKind(a.source, a.sourceType),
        provider: providerName(a.source, a.sourceType),
        displayName: name(a) ?? providerName(a.source, a.sourceType),
        label: labelFor(a, labels),
        nickname: a.nickname?.trim() || null,
        monthCharges: 0,
        monthChargeCount: 0,
        monthCredits: 0,
        monthCreditCount: 0,
      };
      byKey.set(key, summary);
    } else {
      // A later row may know more (RiseUp's sourceType, a nickname).
      if (summary.kind === 'unknown') summary.kind = accountKind(a.source, a.sourceType);
      if (!summary.nickname && a.nickname?.trim()) {
        summary.nickname = a.nickname.trim();
        summary.displayName = name(a) ?? summary.displayName;
      }
    }
    return summary;
  };

  for (const a of all) ensure(a);
  for (const row of monthRows) {
    if (row.source === 'cash' || (!row.source && !row.hash)) continue;
    const summary = ensure(row);
    const amount = Math.abs(Number(row.amountIls ?? 0));
    if (row.isIncome) {
      summary.monthCredits = round(summary.monthCredits + amount);
      summary.monthCreditCount += 1;
    } else {
      summary.monthCharges = round(summary.monthCharges + amount);
      summary.monthChargeCount += 1;
    }
  }

  const order: Record<AccountKind, number> = { card: 0, bank: 1, unknown: 2 };
  return [...byKey.values()].sort(
    (a, b) => order[a.kind] - order[b.kind] || b.monthCharges - a.monthCharges || a.displayName.localeCompare(b.displayName, 'he'),
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
