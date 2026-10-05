import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';

/**
 * Our Money's own schema inside a Supabase project shared with other apps.
 * Every table the app touches is in it; nothing else in the project is ours.
 */
export const DB_SCHEMA = 'money';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cached: SupabaseClient<any, typeof DB_SCHEMA> | null = null;

/**
 * Service-role Supabase client, scoped to the `money` schema. The key opens
 * every app in the shared project and bypasses RLS, so this must never be
 * constructed in code that can reach a browser bundle — every caller is a
 * route handler, a server action or a script.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function db(): SupabaseClient<any, typeof DB_SCHEMA> {
  if (!cached) {
    cached = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      db: { schema: DB_SCHEMA },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
