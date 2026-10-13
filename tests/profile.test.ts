import { describe, expect, it } from 'vitest';

import { drawerName, greetingName, signedInMember, memberName, normalizePreferredName } from '@/lib/profile/names';

describe('greetingName', () => {
  it('uses the name the member chose', () => {
    expect(greetingName({ display_name: 'Nehemiah Tg', preferred_name: 'יצחק' })).toBe('יצחק');
  });

  it('never falls back to the Telegram account name', () => {
    expect(greetingName({ display_name: 'Nehemiah Tg', preferred_name: null })).toBe('');
    expect(greetingName({ display_name: 'Nehemiah Tg', preferred_name: '   ' })).toBe('');
    expect(greetingName({ display_name: 'Nehemiah Tg' })).toBe('');
    expect(greetingName(undefined)).toBe('');
  });
});

describe('drawerName', () => {
  it('shows the chosen name in the drawer header', () => {
    expect(drawerName({ display_name: 'Nehemiah Tg', preferred_name: 'יצחק' })).toBe('יצחק');
  });

  it('says just "היי" until a name is chosen — never the Telegram name', () => {
    expect(drawerName({ display_name: 'Nehemiah Tg', preferred_name: null })).toBe('היי');
    expect(drawerName({ display_name: 'Nehemiah Tg', preferred_name: '  ' })).toBe('היי');
    expect(drawerName(undefined)).toBe('היי');
  });
});

describe('signedInMember', () => {
  const rows = [
    { id: 'a', display_name: 'A', preferred_name: 'יצחק' },
    { id: 'b', display_name: 'B', preferred_name: 'שרה' },
  ];

  it('finds the signed-in member by id', () => {
    expect(signedInMember(rows, 'b')?.preferred_name).toBe('שרה');
  });

  it('never stands in another member when the signed-in one is missing', () => {
    expect(signedInMember(rows, 'missing')).toBeUndefined();
    expect(signedInMember(rows, null)).toBeUndefined();
    expect(greetingName(signedInMember(rows, 'missing'))).toBe('');
    expect(drawerName(signedInMember(rows, null))).toBe('היי');
  });
});

describe('memberName', () => {
  it('prefers the chosen name and keeps the Telegram one only as a label of last resort', () => {
    expect(memberName({ display_name: 'Nehemiah', preferred_name: 'יצחק' })).toBe('יצחק');
    expect(memberName({ display_name: 'Nehemiah', preferred_name: null })).toBe('Nehemiah');
  });
});

describe('normalizePreferredName', () => {
  it('trims and squeezes spaces', () => {
    expect(normalizePreferredName('  יצחק   אברגל ')).toEqual({ ok: true, value: 'יצחק אברגל' });
  });

  it('treats an empty name as "clear it"', () => {
    expect(normalizePreferredName('')).toEqual({ ok: true, value: null });
    expect(normalizePreferredName('   ')).toEqual({ ok: true, value: null });
  });

  it('refuses a name that is too long', () => {
    const result = normalizePreferredName('א'.repeat(41));
    expect(result.ok).toBe(false);
  });

  it('refuses control characters and markup', () => {
    expect(normalizePreferredName('יצחק\u0000').ok).toBe(false);
    expect(normalizePreferredName('<b>יצחק</b>').ok).toBe(false);
  });
});
