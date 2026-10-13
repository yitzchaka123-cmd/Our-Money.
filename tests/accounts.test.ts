import { describe, expect, it } from 'vitest';

import { merchantLine } from '@/app/dashboard/components/EnvelopeCard';
import {
  accountDisplayName,
  accountKind,
  accountNamer,
  providerName,
  summarizeAccounts,
  type AccountLabel,
} from '@/lib/dashboard/accounts';
import type { NormalizedActual } from '@/lib/riseup/envelopes';

const labels: AccountLabel[] = [{ source: 'leumicard', accountNumberHash: 'cc5910', label: 'כרטיס 0848' }];

describe('provider names (V1-07)', () => {
  it('turns RiseUp source ids into the names people know', () => {
    expect(providerName('leumicard')).toBe('לאומי קארד');
    expect(providerName('leumiBank')).toBe('בנק לאומי');
    expect(providerName('isracard')).toBe('ישראכרט');
    expect(providerName('max')).toBe('מקס');
    expect(providerName('visaCal')).toBe('כאל');
    expect(providerName('poalim')).toBe('בנק הפועלים');
    expect(providerName('discount')).toBe('בנק דיסקונט');
    expect(providerName('mizrahi')).toBe('מזרחי טפחות');
    expect(providerName('otsarHahayal')).toBe('בנק אוצר החייל');
  });

  it('describes an unknown provider in plain Hebrew, never its raw English id', () => {
    expect(providerName('newbank', 'bankAccount')).toBe('חשבון בנק');
    expect(providerName('someNewCard', 'creditCard')).toBe('כרטיס');
    expect(providerName('mysteryProvider')).toBe('חשבון');
    expect(providerName(null, 'creditCard')).toBe('כרטיס אשראי');
    expect(providerName(null)).toBe('חשבון');
  });

  it('tells cards from bank accounts', () => {
    expect(accountKind('leumicard')).toBe('card');
    expect(accountKind('leumiBank')).toBe('bank');
    expect(accountKind('something', 'creditCard')).toBe('card');
    expect(accountKind('something')).toBe('unknown');
  });
});

describe('accountDisplayName (V1-07)', () => {
  it('prefers your own name, then RiseUp’s nickname, then the provider', () => {
    expect(accountDisplayName({ source: 'leumicard', hash: 'cc5910', nickname: 'הכרטיס של רייזאפ' }, labels)).toBe('כרטיס 0848');
    expect(accountDisplayName({ source: 'leumicard', hash: 'aa1111', nickname: 'הכרטיס של רייזאפ' }, labels)).toBe('הכרטיס של רייזאפ');
    expect(accountDisplayName({ source: 'leumicard', hash: 'aa1111' }, labels)).toBe('לאומי קארד');
  });

  it('numbers unnamed accounts that share a provider — never shows the code', () => {
    const siblings = [
      { source: 'leumicard', hash: 'cc5910' },
      { source: 'leumicard', hash: 'aa1111' },
      { source: 'leumiBank', hash: 'ef9012' },
    ];
    // Stable order by code: aa1111 is 1, cc5910 is 2, whatever order they arrive in.
    expect(accountDisplayName(siblings[0]!, [], siblings)).toBe('לאומי קארד 2');
    expect(accountDisplayName(siblings[1]!, [], siblings)).toBe('לאומי קארד 1');
    expect(accountDisplayName(siblings[1]!, [], [...siblings].reverse())).toBe('לאומי קארד 1');
    expect(accountDisplayName(siblings[2]!, [], siblings)).toBe('בנק לאומי');
    for (const s of siblings) expect(accountDisplayName(s, [], siblings)).not.toMatch(/cc5910|aa1111|ef9012/);
  });

  it('needs no number once the other card has a name of its own', () => {
    const siblings = [
      { source: 'leumicard', hash: 'cc5910' },
      { source: 'leumicard', hash: 'aa1111' },
    ];
    // "כרטיס 0848" is the couple's name for cc5910, so aa1111 is the only unnamed one.
    expect(accountDisplayName(siblings[1]!, labels, siblings)).toBe('לאומי קארד');
    const namer = accountNamer(siblings, labels);
    expect(siblings.map((s) => namer(s))).toEqual(['כרטיס 0848', 'לאומי קארד']);
  });

  it('numbers two unknown cards in Hebrew too', () => {
    const siblings = [
      { source: 'newCardCo', hash: 'x2', sourceType: 'creditCard' },
      { source: 'newCardCo', hash: 'x1', sourceType: 'creditCard' },
    ];
    const namer = accountNamer(siblings, []);
    expect(siblings.map((s) => namer(s))).toEqual(['כרטיס 2', 'כרטיס 1']);
  });

  it('never shows the raw code with "כרטיס" in front of it', () => {
    const name = accountNamer([{ source: 'leumicard', hash: 'cc5910' }], [])({ source: 'leumicard', hash: 'cc5910' });
    expect(name).toBe('לאומי קארד');
    expect(name).not.toContain('cc5910');
  });

  it('leaves cash rows alone', () => {
    expect(accountNamer([], [])({ source: 'cash', hash: null, nickname: 'מזומן' })).toBeNull();
  });
});

describe('merchantLine', () => {
  const card: NormalizedActual = {
    transactionId: 't1', transactionDate: '2026-10-01', billingDate: '2026-10-01', businessName: 'באג בית שמש',
    amountIls: 60, isIncome: false, accountNickname: null, accountNumberHash: 'cc5910', source: 'leumicard',
    isInstallment: false, paymentNumber: null, totalPayments: null, categoryLabel: null,
  };

  it('reads like RiseUp once the account has a name', () => {
    expect(merchantLine({ ...card, accountName: 'כרטיס 0848' })).toBe('באג בית שמש כרטיס 0848');
    expect(merchantLine({ ...card, accountName: 'לאומי קארד' })).toBe('באג בית שמש לאומי קארד');
  });

  it('falls back to the provider, not the code, when the loader did not name it', () => {
    expect(merchantLine(card)).toBe('באג בית שמש לאומי קארד');
  });
});

describe('summarizeAccounts (V1-07, V1-23)', () => {
  it('lists every account once, with this month’s charges and credits', () => {
    const summaries = summarizeAccounts({
      known: [
        { source: 'leumicard', hash: 'cc5910', sourceType: 'creditCard' },
        { source: 'leumiBank', hash: 'bk0001', sourceType: 'bankAccount' },
        { source: 'isracard', hash: 'zz0000' },
      ],
      monthRows: [
        { source: 'leumicard', hash: 'cc5910', amountIls: 60, isIncome: false },
        { source: 'leumicard', hash: 'cc5910', amountIls: '64.3', isIncome: false },
        { source: 'leumiBank', hash: 'bk0001', amountIls: 7635, isIncome: true },
        { source: 'leumiBank', hash: 'bk0001', amountIls: 2515.2, isIncome: false },
        { source: 'cash', hash: null, amountIls: 10, isIncome: false },
      ],
      labels,
    });

    expect(summaries.map((s) => [s.displayName, s.kind, s.monthCharges, s.monthChargeCount, s.monthCredits])).toEqual([
      ['כרטיס 0848', 'card', 124.3, 2, 0],
      ['ישראכרט', 'card', 0, 0, 0],
      ['בנק לאומי', 'bank', 2515.2, 1, 7635],
    ]);
    expect(summaries[0]).toMatchObject({ label: 'כרטיס 0848', provider: 'לאומי קארד', source: 'leumicard', hash: 'cc5910' });
  });
});
