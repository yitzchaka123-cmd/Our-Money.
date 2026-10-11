import { describe, expect, it } from 'vitest';

import { setupSteps, stepsBannerText, walletBalanceSet, type SetupFacts } from '@/lib/dashboard/steps';

const allDone: SetupFacts = {
  lastSyncAt: '2026-10-11T08:00:00Z',
  telegramLinked: true,
  preferredName: 'יצחק',
  walletBalanceSet: true,
};

describe('setupSteps', () => {
  it('lists the four steps in a fixed order', () => {
    expect(setupSteps(allDone).map((s) => s.id)).toEqual(['riseup', 'telegram', 'name', 'wallet']);
  });

  it('marks every step done when nothing is missing', () => {
    expect(setupSteps(allDone).every((s) => s.done)).toBe(true);
  });

  it('flags RiseUp until the first successful sync', () => {
    const steps = setupSteps({ ...allDone, lastSyncAt: null });
    expect(steps.find((s) => s.id === 'riseup')?.done).toBe(false);
  });

  it('flags the name until one is chosen, ignoring blanks', () => {
    expect(setupSteps({ ...allDone, preferredName: null }).find((s) => s.id === 'name')?.done).toBe(false);
    expect(setupSteps({ ...allDone, preferredName: '  ' }).find((s) => s.id === 'name')?.done).toBe(false);
  });

  it('flags Telegram and the wallet on their own facts', () => {
    const steps = setupSteps({ ...allDone, telegramLinked: false, walletBalanceSet: false });
    expect(steps.filter((s) => !s.done).map((s) => s.id)).toEqual(['telegram', 'wallet']);
  });

  it('gives every step a title and a line saying how to fix it', () => {
    for (const step of setupSteps({ lastSyncAt: null, telegramLinked: false, preferredName: null, walletBalanceSet: false })) {
      expect(step.title.length).toBeGreaterThan(3);
      expect(step.hint.length).toBeGreaterThan(10);
    }
  });
});

describe('stepsBannerText', () => {
  it('is null when nothing is missing, so the banner hides', () => {
    expect(stepsBannerText(setupSteps(allDone))).toBeNull();
  });

  it('counts the steps done out of all of them', () => {
    const text = stepsBannerText(setupSteps({ ...allDone, preferredName: null, walletBalanceSet: false }));
    expect(text).toEqual({ lead: 'השלמת', strong: '2 מתוך 4 צעדים', tail: 'והתחלת לצמוח!' });
  });

  it('invites a first step when none is done yet', () => {
    const text = stepsBannerText(setupSteps({ lastSyncAt: null, telegramLinked: false, preferredName: null, walletBalanceSet: false }));
    expect(text?.strong).toBe('4 צעדים');
  });
});

describe('walletBalanceSet', () => {
  const none = { topups: [], spends: 0, transfers: 0 };

  it('is false when the only cash is what the bank reported', () => {
    expect(walletBalanceSet({ ...none, topups: [{ source: 'riseup_withdrawal' }] })).toBe(false);
    expect(walletBalanceSet(none)).toBe(false);
  });

  it('is true once an amount was set or added by hand', () => {
    expect(walletBalanceSet({ ...none, topups: [{ source: 'manual' }] })).toBe(true);
    expect(walletBalanceSet({ ...none, topups: [{ source: 'adjustment' }] })).toBe(true);
    expect(walletBalanceSet({ ...none, topups: [{ source: 'cash_income' }] })).toBe(true);
  });

  it('is true once any cash was spent or moved between wallets', () => {
    expect(walletBalanceSet({ ...none, spends: 1 })).toBe(true);
    expect(walletBalanceSet({ ...none, transfers: 2 })).toBe(true);
  });
});
