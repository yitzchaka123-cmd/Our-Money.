import type { CashEntryDraft } from '@/app/dashboard/components/CashEntrySheet';
import type { BriefItem } from '@/lib/dashboard/brief';
import type { WalletMovement } from '@/lib/dashboard/data';
import type { NormalizedActual } from '@/lib/riseup/envelopes';

/**
 * The edit sheet's draft for an entry someone already logged. The member is
 * carried by id from the row itself — never looked up by name, which changes
 * when someone picks a name — so saving an edit never moves a partner's entry
 * to whoever happens to be signed in. Only an entry with no member at all
 * falls back to the signed-in member.
 */

function keepMember(memberId: string | null | undefined, sessionMemberId: string | null): string | null {
  return memberId ?? sessionMemberId;
}

/** A cash row in an envelope or the transaction sheet. */
export function actualDraft(
  actual: NormalizedActual,
  envelopeId: string | null,
  sessionMemberId: string | null,
  today: string,
): CashEntryDraft | null {
  if (!actual.cash) return null;
  return {
    id: actual.cash.id,
    kind: actual.cash.kind,
    amountIls: actual.amountIls,
    category: actual.categoryLabel ?? '',
    note: actual.businessName === actual.categoryLabel ? '' : actual.businessName,
    date: actual.transactionDate ?? today,
    envelopeId: actual.cash.kind === 'spend' ? envelopeId : null,
    memberId: keepMember(actual.cash.memberId, sessionMemberId),
    walletId: actual.cash.walletId,
  };
}

/** A cash card in the daily brief (spend, cash income or a typed withdrawal). */
export function briefDraft(target: BriefItem, sessionMemberId: string | null): CashEntryDraft {
  const kind = target.kind === 'cash-spend' ? 'spend' : target.kind === 'cash-income' ? 'income' : 'withdrawal';
  const id = target.key.slice(target.key.indexOf(':') + 1);
  const note = target.actual.businessName === target.actual.categoryLabel ? '' : target.actual.businessName;
  return {
    id,
    kind,
    fromBank: false,
    amountIls: target.amountIls,
    category: target.actual.categoryLabel ?? '',
    note: kind === 'withdrawal' && note === 'משיכת מזומן' ? '' : note,
    date: target.date ?? '',
    envelopeId: kind === 'spend' ? target.envelopeId : null,
    memberId: keepMember(target.memberId, sessionMemberId),
    walletId: target.actual.cash?.walletId ?? null,
  };
}

/** A movement in the wallet list (not transfers or balance adjustments). */
export function movementDraft(m: WalletMovement, sessionMemberId: string | null): CashEntryDraft {
  return {
    id: m.id,
    kind: m.kind === 'income' || m.kind === 'withdrawal' ? m.kind : 'spend',
    fromBank: m.fromBank,
    amountIls: m.amountIls,
    category: m.category ?? '',
    note: m.note ?? '',
    date: m.date,
    envelopeId: null,
    memberId: keepMember(m.memberId, sessionMemberId),
    walletId: m.walletId,
  };
}
