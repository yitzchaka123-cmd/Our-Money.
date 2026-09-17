export type Confidence = 'high' | 'medium' | 'low';
export type SpendStatus = 'confirmed' | 'needs_review' | 'deleted';
export type InputKind = 'text' | 'voice' | 'web';

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
  /** RiseUp envelope this spend lives in; null means the month's variable envelope. */
  envelope_id: string | null;
  envelope_type: string | null;
  created_at: string;
}

export interface CashTopup {
  id: string;
  amount_ils: number;
  occurred_at: string;
  source: 'riseup_withdrawal' | 'manual' | 'cash_income';
  riseup_transaction_id: string | null;
  business_name: string | null;
  note: string | null;
  is_dismissed: boolean;
  member_id: string | null;
  category: string | null;
  input_kind: InputKind | null;
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

/** RiseUp envelope types, as returned by the budget endpoint. */
export type EnvelopeType =
  | 'variableIncome'
  | 'variable'
  | 'fixed'
  | 'trackingCategory'
  | 'riseupGoal'
  /** Not a RiseUp type — the cash income envelope this app adds. */
  | 'cashIncome';

export interface RiseupEnvelopeActual {
  transactionId: string;
  transactionDate?: string;
  billingDate?: string;
  businessName?: string;
  isIncome?: boolean;
  billingAmount?: number | null;
  incomeAmount?: number | null;
  originalAmount?: number;
  accountNickname?: string | null;
  accountNumberHash?: string | null;
  source?: string;
  isInstallment?: boolean;
  paymentNumber?: number;
  totalNumberOfPayments?: number;
  expense?: string;
  categoryLabel?: string;
}

export interface RiseupEnvelope {
  id: string;
  type: EnvelopeType;
  originalAmount?: number;
  balancedAmount?: number;
  balanceDate?: string;
  isCustomPrediction?: boolean;
  sequenceCustomerComment?: string;
  /** The field carrying a tracking category's display name is not documented. */
  name?: string;
  categoryName?: string;
  label?: string;
  actuals?: RiseupEnvelopeActual[];
}

export interface RiseupBudget {
  budgetDate?: string;
  lastUpdatedAt?: string;
  envelopes?: RiseupEnvelope[];
}
