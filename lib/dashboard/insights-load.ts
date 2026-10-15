import { fetchAll } from '@/lib/dashboard/brief-load';
import type { DashboardData } from '@/lib/dashboard/data';
import { computeInsights, type Insight, type InsightFeedback, type InsightInput } from '@/lib/dashboard/insights';
import { db } from '@/lib/db/client';
import { isoDateInIsrael } from '@/lib/dates';

/** "A usual expense" is judged on this many days. */
const BASELINE_DAYS = 90;
/** Daily forecast figures older than this are deleted as new ones are written. */
const SNAPSHOT_KEEP_DAYS = 40;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

/**
 * Keep today's forecast (the last one seen today wins) and hand back
 * yesterday's, so a card can say how it moved.
 */
export async function recordForecast(month: string, forecast: number, today: string): Promise<number | null> {
  const supabase = db();
  must(
    await supabase
      .from('forecast_snapshots')
      .upsert({ day: today, month, forecast, at: new Date().toISOString() }, { onConflict: 'day' }),
    'store forecast',
  );
  const [yesterday] = await Promise.all([
    supabase.from('forecast_snapshots').select('forecast').eq('day', addDays(today, -1)).eq('month', month).maybeSingle(),
    supabase.from('forecast_snapshots').delete().lt('day', addDays(today, -SNAPSHOT_KEEP_DAYS)),
  ]);
  const row = must(yesterday, 'yesterday forecast') as { forecast: number | string } | null;
  return row ? Number(row.forecast) : null;
}

export async function loadFeedback(memberId: string): Promise<InsightFeedback> {
  const rows = must(
    await db().from('insight_feedback').select('insight_key, dismissed, helpful').eq('member_id', memberId),
    'insight feedback',
  ) as { insight_key: string; dismissed: boolean; helpful: boolean | null }[];
  return new Map(rows.map((r) => [r.insight_key, { dismissed: r.dismissed, helpful: r.helpful }]));
}

/**
 * Each tracker's target for the insight cards: the merged envelope's own
 * plan for the whole month — a weekly tracker's parts summed, or our own
 * target — never a stored row of one weekly part (V2-1: that read 338.97,
 * one week of a 3,050.73 month).
 */
export function trackerTargets(envelopes: DashboardData['envelopes']): InsightInput['trackers'] {
  return envelopes
    .filter((e) => e.type === 'trackingCategory')
    .map((e) => ({ name: e.title, planned: e.planned ?? 0, actual: e.actual }));
}

/**
 * The insight cards for the dashboard. They are about now, so only the
 * current month gets them; looking back at an old month shows none.
 */
export async function loadInsights(data: DashboardData, memberId: string, now = new Date()): Promise<Insight[]> {
  const today = isoDateInIsrael(now);
  if (data.month !== today.slice(0, 7)) return [];
  const supabase = db();
  const since = addDays(today, -BASELINE_DAYS);

  const [yesterdayForecast, riseupAmounts, cashRows, feedback] = await Promise.all([
    recordForecast(data.month, data.forecast, today),
    fetchAll<{ amount_ils: number | string | null }>((from, to) =>
      supabase
        .from('riseup_transactions')
        .select('amount_ils')
        .eq('is_income', false)
        .eq('is_withdrawal', false)
        .gte('transaction_date', since)
        .order('transaction_id')
        .range(from, to),
    ),
    supabase
      .from('cash_spends')
      .select('amount_ils')
      .neq('status', 'deleted')
      .gte('spent_at', since)
      .then((r) => must(r, 'cash baseline') as { amount_ils: number | string }[]),
    loadFeedback(memberId),
  ]);

  return computeInsights(
    {
      today,
      month: data.month,
      envelopes: data.envelopes,
      trackers: trackerTargets(data.envelopes),
      forecast: data.forecast,
      yesterdayForecast,
      wallet: { balance: data.wallet.balance, wallets: data.wallet.wallets.map((w) => ({ name: w.name, balance: w.balance })) },
      baselineExpenses: [...riseupAmounts, ...cashRows].map((r) => Math.abs(Number(r.amount_ils ?? 0))).filter((n) => n > 0),
    },
    feedback,
  );
}

export async function loadInsightsSafely(data: DashboardData, memberId: string): Promise<Insight[]> {
  try {
    return await loadInsights(data, memberId);
  } catch (error) {
    console.error('Insight cards failed to load', error);
    return [];
  }
}
