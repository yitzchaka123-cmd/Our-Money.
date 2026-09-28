import { describe, expect, it } from 'vitest';

import type { CashPlan, PlanOccurrence } from '@/lib/cash/plans';
import { decodeCallback } from '@/lib/telegram/format';
import { composeNudge, type NudgeInput } from '@/lib/telegram/nudge';

const members = [
  { id: 'm1', displayName: 'יצחק אברגל', telegramUserId: 111 },
  { id: 'm2', displayName: 'שרה', telegramUserId: 222 },
];

const plan: CashPlan = {
  id: '5f0c2b8e-1d2a-4c3b-9e4f-0a1b2c3d4e5f',
  kind: 'spend',
  amount_ils: 800,
  category: 'ניקיון',
  note: 'עוזרת בית',
  envelope_type: 'fixed',
  envelope_name: null,
  day_of_month: 20,
  recurrence: 'monthly',
  starts_month: '2026-01',
  ends_month: null,
  wallet_id: null,
  member_id: 'm2',
  is_active: true,
};

const occurrence: PlanOccurrence = {
  planId: plan.id,
  kind: 'spend',
  amountIls: 800,
  plannedIls: 800,
  date: '2026-09-20',
  category: 'ניקיון',
  note: 'עוזרת בית',
  walletId: null,
  memberId: 'm2',
  recurrence: 'monthly',
  status: 'pending',
  settledEntryIds: [],
};

function input(overrides: Partial<NudgeInput> = {}): NudgeInput {
  return { members, loggedToday: new Set(), due: [], reviewCount: 0, groupChatId: -100, ...overrides };
}

describe('composeNudge', () => {
  it('says nothing on a day with nothing to do', () => {
    expect(composeNudge(input({ loggedToday: new Set(['m1', 'm2']) }))).toEqual([]);
  });

  it('names, by first name, only the people who have not logged today', () => {
    const [message] = composeNudge(input({ loggedToday: new Set(['m2']) }));
    expect(message?.chatId).toBe(-100);
    expect(message?.text).toContain('יצחק');
    expect(message?.text).not.toContain('אברגל');
    expect(message?.text).not.toContain('שרה');
  });

  it('mentions entries waiting for review even when everyone logged', () => {
    const [message] = composeNudge(input({ loggedToday: new Set(['m1', 'm2']), reviewCount: 3 }));
    expect(message?.text).toContain('3 רישומים');
  });

  it('adds a message per due plan with paid and skip buttons for this month', () => {
    const messages = composeNudge(input({ loggedToday: new Set(['m1', 'm2']), due: [{ plan, occurrence }] }));
    expect(messages).toHaveLength(1);
    const buttons = messages[0]!.keyboard![0]!;
    expect(decodeCallback(buttons[0]!.callback_data)).toEqual({ kind: 'settle_plan', spendId: plan.id, month: '2026-09' });
    expect(decodeCallback(buttons[1]!.callback_data)).toEqual({ kind: 'skip_plan', spendId: plan.id, month: '2026-09' });
  });

  it('without a group, messages each member privately about their own day and plans', () => {
    const messages = composeNudge(input({ groupChatId: null, loggedToday: new Set(['m2']), due: [{ plan, occurrence }] }));
    expect(messages.map((m) => m.chatId)).toEqual([111, 222]);
    // Sara logged today, so her only message is her plan.
    expect(messages[1]!.keyboard).toBeDefined();
  });

  it('escapes names so Telegram HTML cannot break', () => {
    const [message] = composeNudge(input({ members: [{ id: 'x', displayName: '<b>', telegramUserId: 1 }] }));
    expect(message?.text).toContain('&lt;b&gt;');
  });
});
