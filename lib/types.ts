export type Confidence = 'high' | 'medium' | 'low';
export type SpendStatus = 'confirmed' | 'needs_review' | 'deleted';
export type InputKind = 'text' | 'voice';

export interface HouseholdMember {
  id: string;
  telegram_user_id: number;
  display_name: string;
  is_active: boolean;
}

export interface CashSpend {
  id: string;
  member_id: string;
  amount_ils: number;
  category: string;
  note: string | null;
  spent_at: string;
  status: SpendStatus;
  confidence: Confidence;
  input_kind: InputKind;
  raw_input: string | null;
  transcript: string | null;
  telegram_update_id: number | null;
  telegram_chat_id: number | null;
  telegram_message_id: number | null;
  bot_message_id: number | null;
  created_at: string;
}

export interface CashTopup {
  id: string;
  amount_ils: number;
  occurred_at: string;
  source: 'riseup_withdrawal' | 'manual';
  riseup_transaction_id: string | null;
  business_name: string | null;
  note: string | null;
  is_dismissed: boolean;
}

/** A single transaction as returned by RiseUp's read-only external API. */
export interface RiseupTransaction {
  transactionId: string;
  transactionDate: string;
  billingDate?: string;
  cashflowDate: string;
  businessName: string;
  isIncome: boolean;
  amount: number;
  accountNickname?: string | null;
  accountNumberHash?: string | null;
  isInstallment?: boolean;
  isPostponed?: boolean;
  sourceType?: string;
  source?: string;
  categoryLabel?: string;
  categoryType?: string;
}
