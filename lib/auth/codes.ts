import { createHmac, randomInt } from 'node:crypto';

import { db } from '@/lib/db/client';
import { env } from '@/lib/env';

const CODE_TTL_MS = 10 * 60 * 1000;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;
/** Wrong guesses allowed household-wide per window before every attempt is refused. */
export const MAX_FAILURES = 20;

export function hashCode(code: string): string {
  return createHmac('sha256', env.sessionSecret).update(`login-code:${code}`).digest('hex');
}

/** Six digits, zero-padded; codes are compared as strings. */
export function normalizeCode(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  return digits.length === 6 ? digits : null;
}

/**
 * A fresh code for a member. Any earlier unused code of theirs is retired, so
 * only the latest message in the chat ever works.
 */
export async function issueLoginCode(memberId: string, now = Date.now()): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const supabase = db();
  await supabase
    .from('login_codes')
    .update({ used_at: new Date(now).toISOString() })
    .eq('member_id', memberId)
    .is('used_at', null);
  const { error } = await supabase.from('login_codes').insert({
    member_id: memberId,
    code_hash: hashCode(code),
    expires_at: new Date(now + CODE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`Failed to issue a login code: ${error.message}`);
  return code;
}

export type RedeemResult =
  | { ok: true; memberId: string }
  | { ok: false; reason: 'wrong' | 'locked' };

/** Trade a code for the member it was issued to — once. */
export async function redeemLoginCode(input: string, now = Date.now()): Promise<RedeemResult> {
  const supabase = db();

  const since = new Date(now - FAILURE_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from('login_failures')
    .select('id', { count: 'exact', head: true })
    .gte('at', since);
  if ((count ?? 0) >= MAX_FAILURES) return { ok: false, reason: 'locked' };

  const code = normalizeCode(input);
  if (code) {
    // Claim it in the same statement that checks it, so a code works once
    // even if two requests race.
    const { data } = await supabase
      .from('login_codes')
      .update({ used_at: new Date(now).toISOString() })
      .eq('code_hash', hashCode(code))
      .is('used_at', null)
      .gt('expires_at', new Date(now).toISOString())
      .select('member_id')
      .maybeSingle();
    if (data?.member_id) return { ok: true, memberId: data.member_id as string };
  }

  await supabase.from('login_failures').insert({});
  return { ok: false, reason: 'wrong' };
}
