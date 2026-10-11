import {
  buildContext,
  cashSnapshot,
  formatMonth,
  monthSnapshot,
} from '@/lib/assistant/context';
import { currentMonth, loadDashboard } from '@/lib/dashboard/data';
import { isoDateInIsrael } from '@/lib/dates';

/**
 * The assistant's data, read through the dashboard's own loader so its
 * numbers are the ones on screen: this month and last month in full, plus
 * the cash wallets. Other months come through `loadMonthText` on request.
 */
export async function loadAssistantContext(memberId: string): Promise<{
  context: string;
  months: string[];
}> {
  const month = currentMonth();
  const previous = previousMonth(month);
  const [current, before] = await Promise.all([
    loadDashboard(month, memberId),
    loadDashboard(previous, memberId),
  ]);
  const months = current.months;
  const previousHasData = before.envelopes.length > 0 || before.wallet.movements.length > 0;

  return {
    months,
    context: buildContext({
      today: isoDateInIsrael(),
      current: monthSnapshot(current),
      previous: previousHasData ? monthSnapshot(before) : null,
      cash: cashSnapshot(current),
      availableMonths: months,
      lastSyncAt: current.lastSyncAt,
    }),
  };
}

/** One month as text, for the get_month tool. */
export async function loadMonthText(month: string, memberId: string): Promise<string> {
  const data = await loadDashboard(month, memberId);
  if (data.envelopes.length === 0 && data.wallet.movements.length === 0) {
    return `אין נתונים לחודש ${month}.`;
  }
  return formatMonth(monthSnapshot(data), `חודש ${month}`);
}

export function previousMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year!, monthNumber! - 2, 1)).toISOString().slice(0, 7);
}
