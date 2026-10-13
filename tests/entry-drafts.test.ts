import { describe, expect, it } from 'vitest';

import { buildBrief, type BriefSource } from '@/lib/dashboard/brief';
import { assembleMonth, buildWallet, spendToActual } from '@/lib/dashboard/data';
import { actualDraft, briefDraft, movementDraft } from '@/lib/dashboard/entry-drafts';
import { memberNameMap } from '@/lib/profile/names';
import type { CashSpend, CashTopup } from '@/lib/types';

// Sara chose a name ("שרי") that is not her Telegram account's name.
const rows = [
  { id: 'yitzchak', display_name: 'Itzik TG', preferred_name: 'יצחק' },
  { id: 'sara', display_name: 'Sara Telegram', preferred_name: 'שרי' },
];
const names = memberNameMap(rows);
const signedIn = 'yitzchak';

function spend(overrides: Partial<CashSpend> = {}): CashSpend {
  return {
    id: 's1',
    member_id: 'sara',
    amount_ils: 45,
    category: 'תחבורה',
    note: 'מונית',
    spent_at: '2026-09-10',
    status: 'confirmed',
    confidence: 'high',
    input_kind: 'web',
    raw_input: null,
    transcript: null,
    telegram_update_id: null,
    telegram_chat_id: null,
    telegram_message_id: null,
    bot_message_id: null,
    envelope_id: null,
    envelope_type: null,
    wallet_id: null,
    plan_id: null,
    created_at: '2026-09-10T10:00:00Z',
    ...overrides,
  };
}

describe('member names', () => {
  it('names every member by the name they chose, else the Telegram one', () => {
    expect(names.get('sara')).toBe('שרי');
    expect(memberNameMap([{ id: 'x', display_name: 'TG name', preferred_name: null }]).get('x')).toBe('TG name');
  });
});

describe('editing an entry keeps the member who logged it', () => {
  it('from an envelope row', () => {
    const actual = spendToActual(spend(), names);
    expect(actual.cash).toMatchObject({ memberId: 'sara', memberName: 'שרי' });
    expect(actualDraft(actual, 'var', signedIn, '2026-09-30')?.memberId).toBe('sara');
  });

  it('from the daily brief', () => {
    const src: BriefSource = {
      asOf: '2026-09-11T00:00:00Z',
      seenUntil: '2026-09-01T00:00:00Z',
      newRiseup: [],
      history: [],
      envelopesByMonth: {},
      cashSpends: [spend()],
      cashTopups: [],
      withdrawalTopups: [],
      wallets: [],
      memberNames: names,
    };
    const item = buildBrief(src).items[0]!;
    expect(item).toMatchObject({ memberId: 'sara', memberName: 'שרי' });
    expect(briefDraft(item, signedIn).memberId).toBe('sara');
  });

  it('from the wallet list', () => {
    const topup: CashTopup = {
      id: 't1',
      amount_ils: 300,
      occurred_at: '2026-09-12',
      source: 'cash_income',
      riseup_transaction_id: null,
      business_name: null,
      note: null,
      is_dismissed: false,
      member_id: 'sara',
      category: 'שיעורים',
      input_kind: 'web',
      wallet_id: null,
      plan_id: null,
    };
    const wallet = buildWallet({
      wallets: [],
      allTopups: [topup],
      allSpends: [spend()],
      allTransfers: [],
      monthTopups: [topup],
      monthSpends: [spend()],
      monthTransfers: [],
      memberNames: names,
    });
    for (const movement of wallet.movements) {
      expect(movement.memberId).toBe('sara');
      expect(movementDraft(movement, signedIn).memberId).toBe('sara');
    }
  });

  it('a cash row in an assembled month carries its member id', () => {
    const { envelopes } = assembleMonth({
      month: '2026-09',
      envelopeRows: [{ envelope_id: 'var', envelope_type: 'variable', name: null, planned_ils: 5000, position: 0 }],
      actualRows: [],
      spends: [spend()],
      topups: [],
      plans: [],
      skippedPlanIds: new Set(),
      memberNames: names,
    });
    const row = envelopes.flatMap((e) => e.actuals).find((a) => a.cash)!;
    expect(row.cash?.memberId).toBe('sara');
  });

  it('falls back to the signed-in member only when the entry has no member', () => {
    const actual = spendToActual(spend(), names);
    const orphan = { ...actual, cash: { ...actual.cash!, memberId: null, memberName: null } };
    expect(actualDraft(orphan, 'var', signedIn, '2026-09-30')?.memberId).toBe(signedIn);
  });
});
