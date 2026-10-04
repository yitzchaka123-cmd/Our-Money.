import { createHmac } from 'node:crypto';

/** Only ever used by the throwaway integration stack. */
export const JWT_SECRET = 'integration-tests-only-jwt-secret-0123456789';

export function signJwt(payload: Record<string, unknown>): string {
  const b64 = (input: string) => Buffer.from(input).toString('base64url');
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify(payload));
  const signature = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
}
