import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DailyBrief } from '@/app/dashboard/components/DailyBrief';
import { EMPTY_BRIEF, type BriefData, type BriefItem } from '@/lib/dashboard/brief';
import { openingStep } from '@/lib/dashboard/brief-deck';

function item(key: string): BriefItem {
  return {
    key: `riseup:${key}`,
    kind: 'riseup',
    amountIls: 50,
    isIncome: false,
    label: 'הוצאות משתנות',
    envelopeType: 'variable',
    envelopeTitle: 'הוצאות משתנות',
    envelopeId: 'var',
    business: `עסק ${key}`,
    date: '2026-10-10',
    account: 'לאומי קארד',
    memberName: null,
    memberId: null,
    needsReview: false,
    insight: null,
    actual: {
      transactionId: key,
      transactionDate: '2026-10-10',
      billingDate: '2026-10-10',
      businessName: `עסק ${key}`,
      amountIls: 50,
      isIncome: false,
      accountNickname: null,
      accountNumberHash: null,
      source: 'leumicard',
      isInstallment: false,
      paymentNumber: null,
      totalPayments: null,
      categoryLabel: null,
    },
    seenAt: '2026-10-10T08:00:00Z',
  };
}

const three: BriefData = { asOf: '2026-10-11T08:00:00Z', seenUntil: '2026-10-10T00:00:00Z', count: 3, items: [item('a'), item('b'), item('c')] };

function render(brief: BriefData, initialStep: number): string {
  return renderToStaticMarkup(
    createElement(DailyBrief, { brief, envelopes: [], members: [], wallets: [], sessionMemberId: 'm1', initialStep }),
  );
}

describe('opening the brief from the drawer (V1-check-7)', () => {
  it('starts at the intro when there is something new', () => {
    expect(openingStep(3)).toBe(0);
  });

  it('goes straight to "סיימנו להיום" when there is nothing new', () => {
    expect(openingStep(0)).toBe(1);
    const html = render(EMPTY_BRIEF, openingStep(0));
    expect(html).toContain('סיימנו להיום');
    expect(html).not.toContain('עדכונים חדשים');
  });
});
