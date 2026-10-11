import { beforeEach, describe, expect, it } from 'vitest';

import { SESSION_EXPIRED_MESSAGE } from '@/lib/auth/member';
import { setPreferredName } from '@/lib/profile/actions';

import { resetDb, seedMember, signIn, signOut, sql } from './helpers';

let yitzchak: string;
let sara: string;

beforeEach(async () => {
  resetDb();
  yitzchak = await seedMember(111, 'Nechemiah Telegram');
  sara = await seedMember(222, 'שרה');
  signIn(yitzchak);
});

describe('your own name (V1-25)', () => {
  it('sets the signed-in member’s name and nobody else’s', async () => {
    expect(await setPreferredName('  יצחק  ')).toEqual({ ok: true });
    expect(sql(`select preferred_name, display_name from household_members where id = '${yitzchak}'`)).toEqual([
      { preferred_name: 'יצחק', display_name: 'Nechemiah Telegram' },
    ]);
    expect(sql(`select preferred_name from household_members where id = '${sara}'`)).toEqual([{ preferred_name: null }]);
  });

  it('clears the name when it is emptied, and refuses a very long one', async () => {
    await setPreferredName('יצחק');
    expect(await setPreferredName('   ')).toEqual({ ok: true });
    expect(sql(`select preferred_name from household_members where id = '${yitzchak}'`)).toEqual([{ preferred_name: null }]);
    expect((await setPreferredName('א'.repeat(41))).ok).toBe(false);
  });

  it('needs a signed-in member', async () => {
    signOut();
    expect(await setPreferredName('יצחק')).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
  });
});
