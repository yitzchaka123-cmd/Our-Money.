import { cookies } from 'next/headers';

import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

/** Shown whenever a dashboard action finds the sign-in link has run out. */
export const SESSION_EXPIRED_MESSAGE =
  'פג תוקף הכניסה. שלחו /dashboard לבוט בטלגרם כדי לקבל קישור חדש, ואז נסו שוב.';

/**
 * The signed-in household member, or null. Server actions check this
 * themselves — an action is an HTTP endpoint whatever the page around it did —
 * and answer with SESSION_EXPIRED_MESSAGE rather than throwing, so the sheet
 * that called it can say what to do instead of showing a crash.
 */
export async function sessionMember(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;
  return session?.memberId ?? null;
}
