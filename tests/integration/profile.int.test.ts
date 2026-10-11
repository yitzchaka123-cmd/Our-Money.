import { beforeEach, describe, expect, it } from 'vitest';

import { loadDashboard } from '@/lib/dashboard/data';
import { setPreferredName } from '@/lib/profile/actions';

import { resetDb, seedMember, seedMonth, signIn, signOut, sql } from './helpers';

const MONTH = '2026-09';
let member: string;

beforeEach(async () => {
  resetDb();
  member = await seedMember(111, 'Nehemiah Telegram');
  await seedMonth(MONTH);
  signIn(member);
});

describe('the name on the greeting', () => {
  it('says just "היי" until a name is chosen — never the Telegram name', async () => {
    const data = await loadDashboard(MONTH, member);
    expect(data.greeting).toBe('');
  });

  it('uses the chosen name once it is set, and clears it again', async () => {
    expect(await setPreferredName('  יצחק ')).toEqual({ ok: true, name: 'יצחק' });
    expect(sql(`select preferred_name from household_members where id = '${member}'`)[0]).toEqual({ preferred_name: 'יצחק' });

    const data = await loadDashboard(MONTH, member);
    expect(data.greeting).toBe('יצחק');
    expect(data.members.find((m) => m.id === member)?.display_name).toBe('יצחק');

    expect(await setPreferredName('')).toEqual({ ok: true, name: null });
    expect((await loadDashboard(MONTH, member)).greeting).toBe('');
  });

  it('only renames the member who is signed in, and only with a session', async () => {
    const other = await seedMember(222, 'Partner');
    await setPreferredName('יצחק');
    expect(sql(`select preferred_name from household_members where id = '${other}'`)[0]).toEqual({ preferred_name: null });

    signOut();
    const refused = await setPreferredName('מישהו');
    expect(refused.ok).toBe(false);
  });

  it('refuses a name that is too long', async () => {
    const result = await setPreferredName('א'.repeat(60));
    expect(result.ok).toBe(false);
  });
});
