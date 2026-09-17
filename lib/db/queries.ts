import { db } from '@/lib/db/client';
import { env } from '@/lib/env';
import type { EnvelopeRef } from '@/lib/cash/envelopes';
import type { CashSpend, CashTopup, EnvelopeType, HouseholdMember } from '@/lib/types';

/**
 * Resolve a Telegram user to a household member, creating the row on first
 * contact if the id is in the allowlist. Returns null for anyone else — the
 * bot is for two people and should stay that way even if its username leaks.
 */
export async function resolveMember(
  telegramUserId: number,
  fallbackName: string,
): Promise<HouseholdMember | null> {
  const supabase = db();

  const { data: existing, error } = await supabase
    .from('household_members')
    .select('id, telegram_user_id, display_name, is_active')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();

  if (error) throw new Error(`Failed to look up member: ${error.message}`);
  if (existing) return existing.is_active ? (existing as HouseholdMember) : null;

  if (!env.allowedTelegramUserIds.includes(telegramUserId)) return null;

  const { data: created, error: insertError } = await supabase
    .from('household_members')
    .insert({
      telegram_user_id: telegramUserId,
      display_name: fallbackName || String(telegramUserId),
    })
    .select('id, telegram_user_id, display_name, is_active')
    .single();

  if (insertError) throw new Error(`Failed to create member: ${insertError.message}`);
  return created as HouseholdMember;
}

/** True when this Telegram update has already been turned into a spend row. */
export async function updateAlreadyProcessed(updateId: number): Promise<boolean> {
  const { data, error } = await db()
    .from('cash_spends')
    .select('id')
    .eq('telegram_update_id', updateId)
    .maybeSingle();

  if (error) throw new Error(`Failed to check update id: ${error.message}`);
  return Boolean(data);
}

export interface NewSpend {
  member_id: string;
  amount_ils: number;
  category: string;
  note: string | null;
  spent_at: string;
  status: CashSpend['status'];
  confidence: CashSpend['confidence'];
  input_kind: CashSpend['input_kind'];
  raw_input: string | null;
  transcript: string | null;
  telegram_update_id: number | null;
  telegram_chat_id: number | null;
  telegram_message_id: number | null;
  envelope_id?: string | null;
  envelope_type?: string | null;
}

export async function insertSpends(rows: NewSpend[]): Promise<CashSpend[]> {
  if (rows.length === 0) return [];
  const { data, error } = await db().from('cash_spends').insert(rows).select('*');
  if (error) throw new Error(`Failed to save spend: ${error.message}`);
  return (data ?? []) as CashSpend[];
}

/** Links the saved rows to the bot's reply so its inline buttons can find them. */
export async function attachBotMessage(
  spendIds: string[],
  botMessageId: number,
): Promise<void> {
  if (spendIds.length === 0) return;
  const { error } = await db()
    .from('cash_spends')
    .update({ bot_message_id: botMessageId, updated_at: new Date().toISOString() })
    .in('id', spendIds);
  if (error) throw new Error(`Failed to attach bot message: ${error.message}`);
}

export async function getSpend(id: string): Promise<CashSpend | null> {
  const { data, error } = await db()
    .from('cash_spends')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load spend: ${error.message}`);
  return (data as CashSpend) ?? null;
}

export async function updateSpend(
  id: string,
  patch: Partial<Pick<CashSpend, 'amount_ils' | 'category' | 'note' | 'spent_at' | 'status' | 'confidence'>>,
): Promise<CashSpend> {
  const { data, error } = await db()
    .from('cash_spends')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update spend: ${error.message}`);
  return data as CashSpend;
}

/** Most recent live spend by this member — what /undo acts on. */
export async function lastSpendForMember(memberId: string): Promise<CashSpend | null> {
  const { data, error } = await db()
    .from('cash_spends')
    .select('*')
    .eq('member_id', memberId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load last spend: ${error.message}`);
  return (data as CashSpend) ?? null;
}

export async function spendsBetween(from: string, to: string): Promise<CashSpend[]> {
  const { data, error } = await db()
    .from('cash_spends')
    .select('*')
    .neq('status', 'deleted')
    .gte('spent_at', from)
    .lte('spent_at', to)
    .order('spent_at', { ascending: false });
  if (error) throw new Error(`Failed to load spends: ${error.message}`);
  return (data ?? []) as CashSpend[];
}

export async function allLiveSpends(): Promise<CashSpend[]> {
  const { data, error } = await db()
    .from('cash_spends')
    .select('*')
    .neq('status', 'deleted');
  if (error) throw new Error(`Failed to load spends: ${error.message}`);
  return (data ?? []) as CashSpend[];
}

export async function activeTopups(): Promise<CashTopup[]> {
  const { data, error } = await db()
    .from('cash_topups')
    .select('*')
    .eq('is_dismissed', false);
  if (error) throw new Error(`Failed to load top-ups: ${error.message}`);
  return (data ?? []) as CashTopup[];
}

export async function membersById(): Promise<Map<string, HouseholdMember>> {
  const { data, error } = await db()
    .from('household_members')
    .select('id, telegram_user_id, display_name, is_active');
  if (error) throw new Error(`Failed to load members: ${error.message}`);
  return new Map((data ?? []).map((m) => [m.id, m as HouseholdMember]));
}

export interface NewCashIncome {
  member_id: string;
  amount_ils: number;
  category: string;
  note: string | null;
  occurred_at: string;
  input_kind: CashSpend['input_kind'];
}

/** Cash received: a wallet top-up with its own source, so the arithmetic stays one rule. */
export async function insertCashIncomes(rows: NewCashIncome[]): Promise<CashTopup[]> {
  if (rows.length === 0) return [];
  const { data, error } = await db()
    .from('cash_topups')
    .insert(rows.map((row) => ({ ...row, source: 'cash_income' })))
    .select('*');
  if (error) throw new Error(`Failed to save cash income: ${error.message}`);
  return (data ?? []) as CashTopup[];
}

/** The month's envelopes, shaped for filing a cash spend into one of them. */
export async function envelopeRefsForMonth(month: string): Promise<EnvelopeRef[]> {
  const { data, error } = await db()
    .from('riseup_envelopes')
    .select('envelope_id, envelope_type, name')
    .eq('month', month);
  if (error) throw new Error(`Failed to load envelopes: ${error.message}`);
  return (data ?? []).map((row) => ({
    envelopeId: row.envelope_id as string,
    type: row.envelope_type as EnvelopeType,
    name: (row.name as string | null) ?? '',
  }));
}
