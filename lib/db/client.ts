import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client. Bypasses RLS, so it must never be constructed
 * in code that can reach a browser bundle — every caller here is a route
 * handler or a script.
 */
export function db(): SupabaseClient {
  if (!cached) {
    cached = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
