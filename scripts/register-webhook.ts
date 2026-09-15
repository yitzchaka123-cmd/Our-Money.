/**
 * Point Telegram at this deployment.
 *
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
 *   PUBLIC_URL=https://our-money.vercel.app npm run telegram:register
 *
 * Re-run it whenever the deployment URL changes.
 */

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const publicUrl = process.env.PUBLIC_URL;

if (!token || !secret || !publicUrl) {
  console.error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and PUBLIC_URL.');
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
    drop_pending_updates: true,
  }),
});

const payload = (await response.json()) as { ok: boolean; description?: string };

if (!payload.ok) {
  console.error(`Failed: ${payload.description}`);
  process.exit(1);
}

console.log(`Webhook registered: ${webhookUrl}`);

export {};
