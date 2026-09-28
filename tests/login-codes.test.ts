import { beforeAll, describe, expect, it } from 'vitest';

import { hashCode, normalizeCode } from '@/lib/auth/codes';

beforeAll(() => {
  process.env.APP_SESSION_SECRET = 'test-secret-for-login-codes';
});

describe('login codes', () => {
  it('accepts six digits typed with spaces or dashes', () => {
    expect(normalizeCode('123 456')).toBe('123456');
    expect(normalizeCode('012-345')).toBe('012345');
  });

  it('rejects anything that is not exactly six digits', () => {
    expect(normalizeCode('12345')).toBeNull();
    expect(normalizeCode('1234567')).toBeNull();
    expect(normalizeCode('abcdef')).toBeNull();
  });

  it('stores a keyed hash, never the code, and the hash is stable', () => {
    expect(hashCode('123456')).toBe(hashCode('123456'));
    expect(hashCode('123456')).not.toBe(hashCode('123457'));
    expect(hashCode('123456')).not.toContain('123456');
  });
});
