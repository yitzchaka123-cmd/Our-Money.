import type { EnvelopeView, WalletMovement } from '@/lib/dashboard/data';
import type { NormalizedActual } from '@/lib/riseup/envelopes';
import type { EnvelopeType } from '@/lib/types';

/**
 * A row in the wallet's "תנועות החודש", as the transaction sheet wants it:
 * the same row (and envelope) the envelopes show, so tapping a cash spend in
 * the wallet opens exactly what tapping it inside its envelope opens.
 */
export interface MovementTransaction {
  actual: NormalizedActual;
  envelopeTitle: string;
  envelopeType: EnvelopeType;
  envelopeId: string | null;
}

/** The envelope row for a spend or cash income, else one built from the movement. */
export function movementTransaction(envelopes: EnvelopeView[], m: WalletMovement): MovementTransaction | null {
  if (m.kind !== 'spend' && m.kind !== 'income') return null;
  const kind = m.kind;
  for (const envelope of envelopes) {
    const actual = envelope.actuals.find((a) => a.cash?.id === m.id && a.cash.kind === kind);
    if (actual) {
      return { actual, envelopeTitle: envelope.title, envelopeType: envelope.type, envelopeId: envelope.envelopeId };
    }
  }
  // Not in any envelope shown (filtered out, or income kept out of the
  // cashflow): the same sheet, from the movement itself.
  return {
    actual: movementActual(m, kind),
    envelopeTitle: kind === 'income' ? 'הכנסה במזומן' : 'הוצאה במזומן',
    envelopeType: kind === 'income' ? 'cashIncome' : 'variable',
    envelopeId: null,
  };
}

/** A wallet movement in the shape of an envelope row. */
export function movementActual(m: WalletMovement, kind: 'spend' | 'income' = 'spend'): NormalizedActual {
  return {
    transactionId: `${kind === 'income' ? 'cash-income' : 'cash'}:${m.id}`,
    transactionDate: m.date,
    billingDate: m.date,
    businessName: m.label,
    amountIls: Math.abs(m.amountIls),
    isIncome: kind === 'income',
    accountNickname: 'מזומן',
    accountNumberHash: null,
    source: 'cash',
    isInstallment: false,
    paymentNumber: null,
    totalPayments: null,
    categoryLabel: m.category,
    cash: {
      id: m.id,
      kind,
      memberId: m.memberId ?? null,
      memberName: m.memberName,
      inputKind: 'web',
      status: 'confirmed',
      walletId: m.walletId,
    },
  };
}
