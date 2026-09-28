import { NextResponse } from 'next/server';

import { redeemLoginCode } from '@/lib/auth/codes';
import { createCookieToken, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sign in with the six-digit code the bot sends with /dashboard. This is the
 * way in for the home-screen app, which cannot see cookies set in the browser.
 * A plain form post, so it works before any JavaScript has loaded.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const form = await request.formData();
  const code = String(form.get('code') ?? '');
  const result = await redeemLoginCode(code);

  // 303: the follow-up request is a GET, whatever method got us here.
  if (!result.ok) {
    return NextResponse.redirect(new URL(`/dashboard?login=${result.reason}`, request.url), 303);
  }

  const response = NextResponse.redirect(new URL('/dashboard', request.url), 303);
  response.cookies.set(SESSION_COOKIE, createCookieToken(result.memberId), SESSION_COOKIE_OPTIONS);
  return response;
}
