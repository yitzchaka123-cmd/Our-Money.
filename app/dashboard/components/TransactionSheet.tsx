'use client';

import { Amount } from '@/app/dashboard/components/Amount';
import { Sheet } from '@/app/dashboard/components/Sheet';
import { Calendar, Coins, Move, Note, Scissors, Tag } from '@/app/dashboard/components/icons';
import { merchantLine, shortDate } from '@/app/dashboard/components/EnvelopeCard';
import type { NormalizedActual } from '@/lib/riseup/envelopes';
import type { EnvelopeType } from '@/lib/types';

export interface OpenTransaction {
  actual: NormalizedActual;
  envelopeTitle: string;
  envelopeType: EnvelopeType;
}

function sheetLabel(type: EnvelopeType, envelopeTitle: string, isCash: boolean): string {
  const prefix = isCash ? 'מזומן · ' : '';
  switch (type) {
    case 'variable':
      return `${prefix}הוצאה משתנה`;
    case 'variableIncome':
      return `${prefix}הכנסות משתנות`;
    case 'cashIncome':
      return 'הכנסה במזומן';
    case 'fixed':
      return `${prefix}הוצאות קבועות · ${envelopeTitle}`;
    default:
      return `${prefix}${envelopeTitle}`;
  }
}

/**
 * The sheet RiseUp opens when a charge is tapped: a full-bleed header in the
 * envelope's colour, then the actions.
 *
 * A cash entry is ours, so its actions are live. A RiseUp charge is not — the
 * API is read-only — so those actions are shown as RiseUp shows them, but
 * disabled, with a line saying why.
 */
export function TransactionSheet({
  open,
  onClose,
  transaction,
  onEditCash,
  onDeleteCash,
}: {
  open: boolean;
  onClose: () => void;
  transaction: OpenTransaction | null;
  onEditCash?: (actual: NormalizedActual) => void;
  onDeleteCash?: (actual: NormalizedActual) => void;
}) {
  if (!transaction) return null;

  const { actual, envelopeTitle, envelopeType } = transaction;
  const isCash = Boolean(actual.cash);
  const onDark = envelopeType !== 'variable';

  return (
    <Sheet open={open} onClose={onClose} labelledBy="txn-sheet-label">
      <div className="envelope" data-type={envelopeType}>
        <div className="sheet-head" data-on-dark={onDark}>
          <p className="label" id="txn-sheet-label">
            {sheetLabel(envelopeType, envelopeTitle, isCash)}
          </p>
          <Amount value={actual.amountIls} className="figure" />
          <p className="meta">{actual.businessName}</p>
          {isCash ? (
            <p className="meta">
              {actual.cash?.memberName ?? ''}
              {actual.cash?.inputKind === 'voice' ? ' · הקלטה' : ''}
              {actual.cash?.status === 'needs_review' ? ' · ממתין לאישור' : ''}
            </p>
          ) : merchantLine(actual) !== actual.businessName ? (
            <p className="meta">{merchantLine(actual).replace(actual.businessName, '').trim()}</p>
          ) : null}
          <p className="meta">{shortDate(actual.transactionDate)}</p>
        </div>
      </div>

      <div className="sheet-body">
        {isCash ? (
          <>
            <ActionRow icon={<Tag />} label="לערוך — סכום, קטגוריה, הערה, תאריך" onClick={() => onEditCash?.(actual)} />
            <ActionRow icon={<Move />} label="להזיז למעטפה אחרת" onClick={() => onEditCash?.(actual)} />
            <ActionRow icon={<Scissors />} label="למחוק את הרישום" onClick={() => onDeleteCash?.(actual)} />
          </>
        ) : (
          <>
            <ActionRow icon={<Note />} label="להוסיף הערה" disabled />
            <ActionRow icon={<Move />} label="להזיז את ההוצאה" disabled />
            <ActionRow icon={<Scissors />} label="לפצל את ההוצאה" disabled />
            <ActionRow icon={<Calendar />} label="להזיז את העסקה לחודש אחר" disabled />
            <ActionRow icon={<Coins />} label="זו הפקדה לחיסכון!" disabled />
            <p style={{ color: 'var(--muted)', fontSize: 14, padding: '4px 8px 12px' }}>
              עריכת עסקאות רייזאפ אפשרית רק באפליקציה של רייזאפ — הגישה שלנו לנתונים היא לקריאה
              בלבד.
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}

function ActionRow({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className="action-row"
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={disabled ? { color: 'var(--muted)', borderColor: '#f1f1f1' } : undefined}
    >
      <span className="ico">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
