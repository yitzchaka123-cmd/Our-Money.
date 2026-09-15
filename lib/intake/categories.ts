import { db } from '@/lib/db/client';

/**
 * Fallback list, mirroring the seed rows in the migration. Used when the
 * categories table cannot be read, so a database hiccup degrades intake
 * quality instead of dropping the message on the floor.
 */
export const FALLBACK_CATEGORIES = [
  'מזון וצריכה',
  'מסעדות',
  'תחבורה ורכב',
  'בריאות',
  'ביגוד והנעלה',
  'פנאי ובידור',
  'חינוך וילדים',
  'בית ותחזוקה',
  'טיפוח',
  'מתנות ותרומות',
  'תקשורת',
  'אחר',
] as const;

export const CATCH_ALL_CATEGORY = 'אחר';

// Cached for the lifetime of the serverless instance. The list changes only
// when a sync discovers a new RiseUp category, so staleness costs nothing.
let cache: { labels: string[]; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function activeCategories(): Promise<string[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.labels;

  try {
    const { data, error } = await db()
      .from('categories')
      .select('label')
      .eq('is_active', true)
      .order('label');
    if (error) throw new Error(error.message);

    const labels = (data ?? []).map((row) => row.label as string);
    if (labels.length === 0) return [...FALLBACK_CATEGORIES];

    cache = { labels, at: Date.now() };
    return labels;
  } catch {
    return [...FALLBACK_CATEGORIES];
  }
}

/**
 * Record categories seen in RiseUp data so the bot's vocabulary converges on
 * the labels actually in use, rather than the ones we guessed at build time.
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
  cache = null;
}

export function resetCategoryCache(): void {
  cache = null;
}
