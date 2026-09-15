import { NextResponse } from 'next/server';

import { SESSION_COOKIE, SESSION_MAX_AGE, verifySessionToken } from '@/lib/auth/session';

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
  if (!token || !verifySessionToken(token)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  const response = NextResponse.redirect(new URL('/dashboard', request.url));
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
