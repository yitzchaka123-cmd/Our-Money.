import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { createCookieToken } from '@/lib/auth/session';
import { db } from '@/lib/db/client';

/** What the mocked next/headers hands to the code under test as the session cookie. */
export const cookieJar: { value: string | null } = { value: null };

export function signIn(memberId: string): void {
  cookieJar.value = createCookieToken(memberId);
}

export function signOut(): void {
  cookieJar.value = null;
}

/** psql sessions resolve unqualified names in our schema, like the app does. */
const PSQL_ENV = { ...process.env, PGOPTIONS: '-c search_path=money' };

/** Run SQL as the superuser and return the rows as JSON. */
export function sql<T = Record<string, unknown>>(query: string): T[] {
  const out = execFileSync(
    join(process.env.TEST_PG_BIN!, 'psql'),
    ['-h', '127.0.0.1', '-p', process.env.TEST_PG_PORT!, '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', `select coalesce(json_agg(t), '[]') from (${query}) t`],
    { stdio: ['ignore', 'pipe', 'pipe'], env: PSQL_ENV },
  ).toString();
  return JSON.parse(out.trim() || '[]') as T[];
}

function exec(statement: string): void {
  execFileSync(
    join(process.env.TEST_PG_BIN!, 'psql'),
    ['-h', '127.0.0.1', '-p', process.env.TEST_PG_PORT!, '-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-c', statement],
    { stdio: ['ignore', 'pipe', 'pipe'], env: PSQL_ENV },
  );
}

/** Empty every table the app writes, and put back what migrations seed. */
export function resetDb(): void {
  exec(`
    truncate cash_spends, cash_topups, cash_transfers, cash_plan_skips, cash_plans,
             riseup_envelope_actuals, riseup_envelopes, riseup_transactions, sync_runs,
             login_codes, login_failures, cash_wallets, household_members cascade;
    insert into cash_wallets (name, is_default, position) values ('ארנק ראשי', true, 0);
  `);
  signOut();
}

export async function seedMember(telegramUserId: number, displayName: string): Promise<string> {
  const { data, error } = await db()
    .from('household_members')
    .insert({ telegram_user_id: telegramUserId, display_name: displayName })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/**
 * A month shaped like a real RiseUp budget: income, variable, fixed (with an
 * insurance charge so the category rules have something to find), a tracker
 * and a savings goal — plus an ATM withdrawal the dashboard must ignore.
 */
export async function seedMonth(month: string): Promise<void> {
  const supabase = db();
  const envelopes = [
    { envelope_id: `${month}-inc`, envelope_type: 'variableIncome', name: null, planned_ils: 12000, actual_ils: 12000, position: 0 },
    { envelope_id: `${month}-var`, envelope_type: 'variable', name: null, planned_ils: 5000, actual_ils: 3500, position: 1 },
    { envelope_id: `${month}-fix`, envelope_type: 'fixed', name: null, planned_ils: 4000, actual_ils: 3500, position: 2 },
    { envelope_id: `${month}-food`, envelope_type: 'trackingCategory', name: 'אוכל בחוץ', planned_ils: 600, actual_ils: 100, position: 3 },
    { envelope_id: `${month}-goal`, envelope_type: 'riseupGoal', name: null, planned_ils: 1000, actual_ils: 0, position: 4 },
  ].map((e) => ({ ...e, month }));
  const { error } = await supabase.from('riseup_envelopes').insert(envelopes);
  if (error) throw new Error(error.message);

  const actual = (envelope: string, id: string, amount: number, name: string, extra: Record<string, unknown> = {}) => ({
    month,
    envelope_id: `${month}-${envelope}`,
    transaction_id: `${month}-${id}`,
    transaction_date: `${month}-05`,
    billing_date: `${month}-05`,
    business_name: name,
    amount_ils: amount,
    is_income: false,
    ...extra,
  });
  const { error: actualsError } = await supabase.from('riseup_envelope_actuals').insert([
    actual('inc', 'salary', 12000, 'משכורת', { is_income: true }),
    actual('var', 'super', 3000, 'שופרסל'),
    actual('var', 'atm', 500, 'משיכת מזומן'),
    actual('fix', 'ins', 3500, 'הראל ביטוח', { category_label: 'ביטוח' }),
    actual('food', 'rest', 100, 'מסעדת הגליל'),
  ]);
  if (actualsError) throw new Error(actualsError.message);
}
