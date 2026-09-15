import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '@/lib/env';

export const SESSION_COOKIE = 'om_session';
const SESSION_DAYS = 7;

interface SessionPayload {
  memberId: string;
  /** Unix seconds. */
  exp: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string): string {
  return createHmac('sha256', env.sessionSecret).update(payload).digest('base64url');
}

/**
 * Mint a login token. Delivered over Telegram to an already-allowlisted member,
 * so possession of the link is the whole credential — hence the short life and
 * the member binding.
 */
export function createSessionToken(memberId: string, now = Date.now()): string {
  const payload: SessionPayload = {
    memberId,
    exp: Math.floor(now / 1000) + SESSION_DAYS * 24 * 60 * 60,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string, now = Date.now()): SessionPayload | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  // Both are base64url of a 32-byte digest, so lengths always match here; the
  // guard is for malformed input rather than for timing.
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as SessionPayload;
  } catch {
    return null;
  }

  if (typeof payload.memberId !== 'string' || typeof payload.exp !== 'number') return null;
  if (payload.exp * 1000 < now) return null;

  return payload;
}

export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
