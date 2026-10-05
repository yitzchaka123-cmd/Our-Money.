import { afterEach, describe, expect, it } from 'vitest';

import { env } from '@/lib/env';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('env', () => {
  it('treats a blank optional variable as unset, so the default applies', () => {
    process.env.RISEUP_API_BASE = '';
    process.env.STT_MODEL = '   ';
    expect(env.riseupApiBase).toBe('https://input.riseup.co.il');
    expect(env.sttModel).toBe('gpt-4o-transcribe');
  });

  it('treats a blank required variable as missing, with a message naming it', () => {
    process.env.TELEGRAM_BOT_TOKEN = '';
    expect(() => env.telegramBotToken).toThrow(/TELEGRAM_BOT_TOKEN is not set/);
  });

  it('derives the webhook secret when none is set, using only characters Telegram accepts', () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = '';
    process.env.APP_SESSION_SECRET = 'a-session-secret';
    expect(env.telegramWebhookSecret).toMatch(/^[A-Za-z0-9_-]{20,256}$/);
  });

  it('falls back to the Vercel production domain for the app address', () => {
    process.env.APP_BASE_URL = '';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'our-money-brown.vercel.app';
    expect(env.appBaseUrl).toBe('https://our-money-brown.vercel.app');
  });
});
