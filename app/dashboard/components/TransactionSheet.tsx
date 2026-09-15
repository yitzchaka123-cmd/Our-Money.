'use client';

import { Amount } from '@/app/dashboard/components/Amount';
import { Sheet } from '@/app/dashboard/components/Sheet';
import {
  Calendar,
  Coins,
  Move,
  Note,
  Scissors,
  Tag,
} from '@/app/dashboard/components/icons';
import { merchantLine, shortDate } from '@/app/dashboard/components/EnvelopeCard';
import type { NormalizedActual } from '@/lib/riseup/envelopes';
import type { EnvelopeType } from '@/lib/types';

export interface OpenTransaction {
  actual: NormalizedActual;
  envelopeTitle: string;
  envelopeType: EnvelopeType;
}

/** Yellow is the only envelope colour dark text reads well on. */
function textOnAccent(type: EnvelopeType): boolean {
  return type !== 'variable';
}

function sheetLabel(type: EnvelopeType, envelopeTitle: string): string {
  switch (type) {
    case 'variable':
      return 'הוצאה משתנה';
    case 'variableIncome':
      return 'הכנסות משתנות';
    case 'fixed':
      return `הוצאות קבועות · ${envelopeTitle}`;
    case 'cash':
    case 'cashUnlogged':
      return `מזומן · ${envelopeTitle}`;
    default:
      return envelopeTitle;
  }
}

/**
 * The action sheet RiseUp opens when a charge is tapped: a full-bleed header in
 * the envelope's colour, then the actions.
 *
 * The actions that would change RiseUp's own records are shown but disabled —
 * RiseUp's API is read-only, so offering them as if they worked would be a lie.
 * Cash entries are ours, so those actions are live.
 */
export function TransactionSheet({
  open,
  onClose,
  transaction,
}: {
  open: boolean;
  onClose: () => void;
  transaction: OpenTransaction | null;
}) {
  if (!transaction) return null;

  const { actual, envelopeTitle, envelopeType } = transaction;
  const isCash = envelopeType === 'cash' || envelopeType === 'cashUnlogged';
  const onDark = textOnAccent(envelopeType);

  return (
    <Sheet open={open} onClose={onClose} labelledBy="txn-sheet-label">
      <div className="envelope" data-type={envelopeType}>
        <div className="sheet-head" data-on-dark={onDark}>
          <p className="label" id="txn-sheet-label">
            {sheetLabel(envelopeType, envelopeTitle)}
          </p>
          <Amount value={actual.amountIls} className="figure" />
          <p className="meta">{actual.businessName}</p>
          {merchantLine(actual) !== actual.businessName ? (
            <p className="meta">{merchantLine(actual).replace(actual.businessName, '').trim()}</p>
          ) : null}
          <p className="meta">{shortDate(actual.transactionDate)}</p>
        </div>
      </div>

      <div className="sheet-body">
        {isCash ? (
          <>
            <ActionRow icon={<Note />} label="לערוך את ההערה" />
            <ActionRow icon={<Tag />} label="לשנות קטגוריה" />
            <ActionRow icon={<Calendar />} label="לשנות תאריך" />
            <ActionRow icon={<Scissors />} label="למחוק את הרישום" />
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
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      className="action-row"
      type="button"
      disabled={disabled}
      style={disabled ? { color: 'var(--muted)', borderColor: '#f1f1f1' } : undefined}
    >
      <span className="ico">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
