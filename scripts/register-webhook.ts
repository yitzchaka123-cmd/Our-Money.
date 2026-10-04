/**
 * Point Telegram at this deployment from a terminal.
 *
 *   TELEGRAM_BOT_TOKEN=... APP_SESSION_SECRET=... \
 *   PUBLIC_URL=https://our-money.vercel.app npm run telegram:register
 *
 * Usually unnecessary: opening /setup on the deployment does the same, and
 * the daily sync re-registers if the URL or secret drifts. The secret is
 * TELEGRAM_WEBHOOK_SECRET if set, otherwise derived from APP_SESSION_SECRET
 * exactly as the app derives it.
 */
import { createHmac } from 'node:crypto';

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret =
  process.env.TELEGRAM_WEBHOOK_SECRET ||
  (process.env.APP_SESSION_SECRET
    ? createHmac('sha256', process.env.APP_SESSION_SECRET).update('telegram-webhook').digest('base64url')
    : undefined);
const publicUrl = process.env.PUBLIC_URL;

if (!token || !secret || !publicUrl) {
  console.error('Set TELEGRAM_BOT_TOKEN, APP_SESSION_SECRET (or TELEGRAM_WEBHOOK_SECRET) and PUBLIC_URL.');
  process.exit(1);
}

const webhookUrl = `${publicUrl.replace(/\/$/, '')}/api/telegram/webhook`;

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
  }),
});

const payload = (await response.json()) as { ok: boolean; description?: string };

if (!payload.ok) {
  console.error(`Failed: ${payload.description}`);
  process.exit(1);
}

console.log(`Webhook registered: ${webhookUrl}`);

