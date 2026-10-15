import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createCookieToken,
  createSessionToken,
  renewedCookieToken,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE,
  verifySessionToken,
} from '@/lib/auth/session';
import { config, proxy } from '@/proxy';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 15, 18, 0);

beforeAll(() => {
  process.env.APP_SESSION_SECRET = 'test-secret-for-sessions';
});

describe('stay signed in (V4-11)', () => {
  it('the cookie and the token in it last 90 days', () => {
    expect(SESSION_MAX_AGE).toBe(90 * 24 * 60 * 60);
    expect(SESSION_COOKIE_OPTIONS.maxAge).toBe(SESSION_MAX_AGE);
    const token = createCookieToken('m1', NOW);
    expect(verifySessionToken(token, NOW + 89 * DAY)?.memberId).toBe('m1');
    expect(verifySessionToken(token, NOW + 91 * DAY)).toBeNull();
  });

  it('stays httpOnly, secure and same-site lax', () => {
    expect(SESSION_COOKIE_OPTIONS).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  });

  it('is renewed on a visit once it is a day old, and not on every request', () => {
    const token = createCookieToken('m1', NOW);
    expect(renewedCookieToken(token, NOW + 60 * 60 * 1000)).toBeNull();
    const renewed = renewedCookieToken(token, NOW + 40 * DAY);
    expect(renewed).not.toBeNull();
    // A fresh 90 days from the visit.
    expect(verifySessionToken(renewed!, NOW + 129 * DAY)?.memberId).toBe('m1');
  });

  it('never renews a token that is expired or forged', () => {
    expect(renewedCookieToken(createCookieToken('m1', NOW), NOW + 91 * DAY)).toBeNull();
    expect(renewedCookieToken('bogus.token', NOW)).toBeNull();
    const [payload] = createCookieToken('m1', NOW).split('.');
    expect(renewedCookieToken(`${payload}.forged`, NOW + 2 * DAY)).toBeNull();
  });

  it('carries a cookie from before this change (30 days) over to 90', () => {
    const older = createSessionToken('m1', NOW, 30);
    const renewed = renewedCookieToken(older, NOW + 2 * DAY);
    expect(verifySessionToken(renewed!, NOW + 80 * DAY)?.memberId).toBe('m1');
  });
});

describe('the proxy renews the cookie on page visits', () => {
  const visit = (path: string, cookie?: string) =>
    proxy(
      new NextRequest(`https://our-money.test${path}`, {
        headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
      }),
    );

  it('sets a fresh 90-day cookie when the old one is more than a day old', () => {
    const old = createCookieToken('m1', Date.now() - 10 * DAY);
    const response = visit('/dashboard', old);
    const set = response.headers.get('set-cookie') ?? '';
    expect(set).toContain(`${SESSION_COOKIE}=`);
    expect(set).toMatch(/Max-Age=7776000/i);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/Secure/i);
    expect(set).toMatch(/SameSite=lax/i);
    const value = /om_session=([^;]+)/.exec(set)![1]!;
    expect(verifySessionToken(value)?.memberId).toBe('m1');
  });

  it('leaves a fresh cookie, a missing one and a bad one alone', () => {
    expect(visit('/dashboard', createCookieToken('m1')).headers.get('set-cookie')).toBeNull();
    expect(visit('/dashboard').headers.get('set-cookie')).toBeNull();
    expect(visit('/dashboard', 'nonsense').headers.get('set-cookie')).toBeNull();
  });

  it('runs on the pages, not on static files or the API', () => {
    const matcher = JSON.stringify(config.matcher);
    for (const page of ['/dashboard', '/accounts', '/settings', '/daily']) expect(matcher).toContain(page);
    expect(matcher).not.toContain('/api');
  });
});
