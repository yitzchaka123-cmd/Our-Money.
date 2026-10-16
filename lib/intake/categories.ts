import { db } from '@/lib/db/client';
import { envelopeRefsForMonth } from '@/lib/db/queries';
import { toOverrides, type TrackerOverrideRow } from '@/lib/dashboard/trackers';
import { botEnvelopes, type BotEnvelope } from '@/lib/intake/envelopes';

/**
 * The bot's categories are the household's own envelopes for the month (see
 * lib/intake/envelopes.ts): every tracker by the name the dashboard shows,
 * "הוצאות משתנות" and "הוצאות קבועות". RiseUp's raw labels are still
 * recorded below, but only so cash rows can reference them — the bot never
 * offers them.
 */

// Cached briefly per instance and month: a burst of messages costs one read,
// and a rename on the dashboard shows up in the bot within a minute.
const cache = new Map<string, { envelopes: BotEnvelope[]; at: number }>();
const CACHE_TTL_MS = 60 * 1000;

async function overridesFor(month: string) {
  // Until migration 0006 is applied this errors, and there are simply no overrides.
  const { data } = await db().from('tracker_overrides').select('*').in('month', ['', month]);
  return toOverrides(data as TrackerOverrideRow[] | null);
}

/** The latest synced month at or before `month`, for a month RiseUp has not planned yet. */
async function latestSyncedMonth(month: string): Promise<string | null> {
  const { data } = await db()
    .from('riseup_envelopes')
    .select('month')
    .lte('month', month)
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.month as string | undefined) ?? null;
}

/**
 * The month's envelopes as the bot offers them. Before RiseUp has planned the
 * month, the trackers of the latest synced month are offered by name, not
 * pinned (the dashboard files them by name once the month exists).
 */
export async function loadBotEnvelopes(month: string): Promise<BotEnvelope[]> {
  const hit = cache.get(month);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.envelopes;

  let envelopes: BotEnvelope[];
  try {
    const [refs, overrides] = await Promise.all([envelopeRefsForMonth(month), overridesFor(month)]);
    if (refs.some((r) => r.type === 'variable' || r.type === 'trackingCategory')) {
      envelopes = botEnvelopes(refs, overrides, month);
    } else {
      const previous = await latestSyncedMonth(month);
      const borrowed = previous && previous !== month ? await envelopeRefsForMonth(previous) : refs;
      envelopes = botEnvelopes(borrowed, overrides, month).map((e) => ({ ...e, envelopeId: null }));
    }
  } catch (error) {
    // A database hiccup degrades to the two big envelopes rather than losing the message.
    console.error('Loading the envelopes for the bot failed', error);
    envelopes = botEnvelopes([], [], month);
  }

  cache.set(month, { envelopes, at: Date.now() });
  return envelopes;
}

/**
 * Record categories seen in RiseUp data, so a cash row may carry any label
 * RiseUp uses (cash_spends.category references money.categories).
 */
export async function recordRiseupCategories(labels: string[]): Promise<void> {
  const unique = [...new Set(labels.filter((l) => l && l.trim().length > 0))];
  if (unique.length === 0) return;

  const { error } = await db()
    .from('categories')
    .upsert(
      unique.map((label) => ({ label, source: 'riseup' })),
      { onConflict: 'label', ignoreDuplicates: true },
    );
  if (error) throw new Error(`Failed to record categories: ${error.message}`);
  cache.clear();
}

export function resetCategoryCache(): void {
  cache.clear();
}
