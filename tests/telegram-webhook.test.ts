import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureWebhook, webhookUrl } from '@/lib/telegram/client';

describe('V4-3: the webhook asks for membership updates', () => {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  let allowed: string[] | undefined;

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.APP_BASE_URL = 'https://our-money.test';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
    calls.length = 0;
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      const method = url.split('/').pop()!;
      const body = JSON.parse(init.body) as Record<string, unknown>;
      calls.push({ method, body });
      if (method === 'setWebhook') allowed = body.allowed_updates as string[];
      const result = method === 'getWebhookInfo' ? { url: webhookUrl(), pending_update_count: 0, allowed_updates: allowed } : true;
      return new Response(JSON.stringify({ ok: true, result }));
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('re-registers a webhook that was set up before groups, adding my_chat_member', async () => {
    allowed = ['message', 'callback_query'];
    const { changed } = await ensureWebhook();
    expect(changed).toBe(true);
    expect(calls.find((c) => c.method === 'setWebhook')!.body.allowed_updates).toEqual(['message', 'callback_query', 'my_chat_member']);
  });

  it('leaves a current webhook alone', async () => {
    allowed = ['message', 'callback_query', 'my_chat_member'];
    expect((await ensureWebhook()).changed).toBe(false);
    expect(calls.some((c) => c.method === 'setWebhook')).toBe(false);
  });
});
