import { NextResponse, type NextRequest } from 'next/server';

import { renewedCookieToken, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/auth/session';

/**
 * Stay signed in (feedback video 4, item 11): every page visit with a good
 * session cookie that is more than a day old gets a fresh 90-day one, so the
 * app does not ask for a code again as long as it is opened now and then.
 *
 * Only renews — it never signs anyone in or turns anyone away; every page and
 * server action still checks the session itself.
 */
export function proxy(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  let renewed: string | null = null;
  try {
    renewed = renewedCookieToken(request.cookies.get(SESSION_COOKIE)?.value);
  } catch (error) {
    // A missing secret must not take the pages down; they will say what is wrong.
    console.error('Session renewal skipped:', error instanceof Error ? error.message : error);
  }
  if (renewed) response.cookies.set(SESSION_COOKIE, renewed, SESSION_COOKIE_OPTIONS);
  return response;
}

export const config = {
  // The pages a person opens (not the API, static files or icons).
  matcher: ['/', '/dashboard', '/accounts', '/settings', '/daily', '/setup'],
};
