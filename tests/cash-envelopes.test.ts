import { describe, expect, it } from 'vitest';

import { envelopeChoices, resolveEnvelopeForCategory, type EnvelopeRef } from '@/lib/cash/envelopes';

const month: EnvelopeRef[] = [
  { envelopeId: 'inc', type: 'variableIncome', name: 'הכנסות' },
  { envelopeId: 'goal', type: 'riseupGoal', name: 'הפקדות לחיסכון' },
  { envelopeId: 'fix', type: 'fixed', name: 'הוצאות קבועות', categoryLabels: ['ביטוח', 'חשמל'] },
  { envelopeId: 'var', type: 'variable', name: 'הוצאות משתנות' },
  { envelopeId: 't-food', type: 'trackingCategory', name: 'אוכל בחוץ' },
  { envelopeId: 't-super', type: 'trackingCategory', name: 'סופר' },
];

describe('resolveEnvelopeForCategory', () => {
  it('files a tracked category into its own envelope', () => {
    expect(resolveEnvelopeForCategory(month, 'סופר')?.envelopeId).toBe('t-super');
  });

  it('tolerates spacing differences in the label', () => {
    expect(resolveEnvelopeForCategory(month, '  אוכל   בחוץ ')?.envelopeId).toBe('t-food');
  });

  it('files a label RiseUp already uses for a fixed charge into the fixed envelope', () => {
    expect(resolveEnvelopeForCategory(month, 'חשמל')?.envelopeId).toBe('fix');
  });

  it('defaults everything else to variable, like RiseUp does', () => {
    expect(resolveEnvelopeForCategory(month, 'מתנות')?.envelopeId).toBe('var');
    expect(resolveEnvelopeForCategory(month, null)?.envelopeId).toBe('var');
  });

  it('returns null when the month has no variable envelope to fall back on', () => {
    expect(resolveEnvelopeForCategory([], 'סופר')).toBeNull();
  });
});

describe('envelopeChoices', () => {
  it('offers variable, then fixed, then the trackers alphabetically — never income or goals', () => {
    expect(envelopeChoices(month).map((e) => e.envelopeId)).toEqual([
      'var',
      'fix',
      't-food',
      't-super',
    ]);
  });
});
