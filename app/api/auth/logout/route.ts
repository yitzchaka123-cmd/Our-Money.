import { NextResponse } from 'next/server';

import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "התנתקות" in the drawer: forget this device's session and go back to the
 * front page, which shows the sign-in screen. A plain form post, so it works
 * before any JavaScript has loaded.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL('/', request.url), 303);
  response.cookies.set(SESSION_COOKIE, '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
