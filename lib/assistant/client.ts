import Anthropic from '@anthropic-ai/sdk';

import type { AssistantClient } from '@/lib/assistant/prompt';
import { env } from '@/lib/env';

let client: Anthropic | null = null;

/** Server-only: the key never leaves the server. Tests mock this module. */
export function assistantClient(): AssistantClient {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey, timeout: 50_000, maxRetries: 1 });
  return client;
}

/** A sentence for the chat when the call itself failed. */
export function failureMessage(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) return 'יותר מדי שאלות ברגע אחד. נסו שוב בעוד דקה.';
  if (error instanceof Anthropic.AuthenticationError) return 'העוזר לא מחובר כרגע (מפתח לא תקין). צריך לבדוק את ההגדרות.';
  if (error instanceof Anthropic.APIConnectionError) return 'אין חיבור לעוזר כרגע. נסו שוב עוד מעט.';
  if (error instanceof Anthropic.APIError) return 'העוזר לא זמין כרגע. נסו שוב עוד מעט.';
  return 'משהו השתבש. נסו שוב.';
}
