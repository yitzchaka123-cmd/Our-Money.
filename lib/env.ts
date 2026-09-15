/**
 * Environment access with loud, early failures.
 *
 * Every getter throws a message that names the variable and what it is for —
 * a silently-undefined token here surfaces as a confusing Telegram or RiseUp
 * error three layers down, which is much harder to diagnose.
 */

function required(name: string, purpose: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. ${purpose} See .env.example.`);
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  get telegramBotToken(): string {
    return required('TELEGRAM_BOT_TOKEN', 'Create a bot with @BotFather.');
  },
  get telegramWebhookSecret(): string {
    return required(
      'TELEGRAM_WEBHOOK_SECRET',
      'This is how the webhook proves a request came from Telegram.',
    );
  },
  get telegramGroupChatId(): number | null {
    const raw = optional('TELEGRAM_GROUP_CHAT_ID');
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  },
  /** Telegram user ids allowed to log. Empty means "nobody yet" — the bot says so. */
  get allowedTelegramUserIds(): number[] {
    return optional('TELEGRAM_ALLOWED_USER_IDS')
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isFinite(id) && id > 0);
  },

  get anthropicApiKey(): string {
    return required('ANTHROPIC_API_KEY', 'Used for the AI intake parsing.');
  },
  get intakeEffort(): 'low' | 'medium' | 'high' {
    const raw = optional('INTAKE_EFFORT', 'low');
    return raw === 'medium' || raw === 'high' ? raw : 'low';
  },

  get openaiApiKey(): string {
    return required('OPENAI_API_KEY', 'Used only to transcribe voice notes.');
  },
  get sttModel(): string {
    return optional('STT_MODEL', 'gpt-4o-transcribe');
  },
  /** Empty means auto-detect, which is the right call when you mix Hebrew and English. */
  get sttLanguage(): string | null {
    return optional('STT_LANGUAGE') || null;
  },
  get hasOpenaiKey(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  },

  get riseupPat(): string {
    return required(
      'RISEUP_PAT',
      'Create one at https://input.riseup.co.il/developer/tokens with the budget:read scope.',
    );
  },
  get riseupApiBase(): string {
    return optional('RISEUP_API_BASE', 'https://input.riseup.co.il').replace(/\/$/, '');
  },

  get supabaseUrl(): string {
    return required('SUPABASE_URL', 'Your Supabase project URL.');
  },
  get supabaseServiceRoleKey(): string {
    return required(
      'SUPABASE_SERVICE_ROLE_KEY',
      'Server-side only — this key bypasses row level security.',
    );
  },

  get sessionSecret(): string {
    return required('APP_SESSION_SECRET', 'Signs dashboard login links.');
  },
  /** Absolute base URL of the deployment — used to build dashboard links. */
  get appBaseUrl(): string {
    return required('APP_BASE_URL', 'e.g. https://our-money.vercel.app').replace(/\/$/, '');
  },

  get cronSecret(): string {
    return required('CRON_SECRET', 'Protects the RiseUp sync endpoint.');
  },
};
