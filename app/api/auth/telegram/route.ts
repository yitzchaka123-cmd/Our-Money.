import { NextResponse } from 'next/server';

import {
  createCookieToken,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  verifySessionToken,
} from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Exchange a bot-issued link for a session cookie.
 *
 * The token travels in the URL, which is why it is short-lived and why the
 * cookie it mints is httpOnly — the link itself should not be the long-term
 * credential sitting in a browser history.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('t');
  const session = token ? verifySessionToken(token) : null;
  if (!session) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // The cookie gets its own token rather than the one from the URL, so the
  // link can expire on its own schedule without signing anyone out.
  const response = NextResponse.redirect(new URL('/dashboard', request.url));
  response.cookies.set(SESSION_COOKIE, createCookieToken(session.memberId), SESSION_COOKIE_OPTIONS);
  return response;
}
