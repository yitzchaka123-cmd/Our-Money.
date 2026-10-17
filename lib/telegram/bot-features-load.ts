import { db } from '@/lib/db/client';
import { BOT_FEATURES, featuresFrom, type BotFeature, type BotFeatures } from '@/lib/telegram/bot-features';

/** Both switches. A failed read (no table yet) leaves them on, their default. */
export async function loadBotFeatures(): Promise<BotFeatures> {
  try {
    const { data, error } = await db()
      .from('app_settings')
      .select('key, value')
      .in('key', BOT_FEATURES.map((f) => f.key));
    return featuresFrom(error ? null : (data as Array<{ key: string; value: string | null }>));
  } catch {
    return featuresFrom(null);
  }
}

export async function botFeatureOn(feature: BotFeature): Promise<boolean> {
  return (await loadBotFeatures())[feature];
}
