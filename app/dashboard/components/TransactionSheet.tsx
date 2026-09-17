'use client';

import { Amount } from '@/app/dashboard/components/Amount';
import { Sheet } from '@/app/dashboard/components/Sheet';
import { Calendar, Coins, Move, Note, Scissors, Tag } from '@/app/dashboard/components/icons';
import { merchantLine, shortDate } from '@/app/dashboard/components/EnvelopeCard';
import type { CashAction } from '@/app/dashboard/components/CashActionSheets';
import type { NormalizedActual } from '@/lib/riseup/envelopes';
import type { EnvelopeType } from '@/lib/types';

export interface OpenTransaction {
  actual: NormalizedActual;
  envelopeTitle: string;
  envelopeType: EnvelopeType;
  envelopeId: string | null;
}

function sheetLabel(type: EnvelopeType, envelopeTitle: string, isCash: boolean): string {
  const prefix = isCash ? 'מזומן · ' : '';
  switch (type) {
    case 'variable': return `${prefix}הוצאה משתנה`;
    case 'variableIncome': return `${prefix}הכנסות משתנות`;
    case 'cashIncome': return 'הכנסה במזומן';
    case 'fixed': return `${prefix}הוצאות קבועות · ${envelopeTitle}`;
    case 'riseupGoal': return `${prefix}הפקדה לחיסכון`;
    default: return `${prefix}${envelopeTitle}`;
  }
}

/**
 * The sheet RiseUp opens when a charge is tapped: a full-bleed header in the
 * envelope's colour, then the actions, in RiseUp's own order and wording.
 *
 * A cash row is ours, so every action is live. A RiseUp charge is not — the
 * API is read-only — so its actions are shown as RiseUp shows them, disabled,
 * with a line saying why.
 */
export function TransactionSheet({
  open,
  onClose,
  transaction,
  walletName,
  onCashAction,
  onEditCash,
  onSavings,
  onDeleteCash,
}: {
  open: boolean;
  onClose: () => void;
  transaction: OpenTransaction | null;
  walletName: string | null;
  onCashAction: (action: CashAction) => void;
  onEditCash: () => void;
  onSavings: () => void;
  onDeleteCash: () => void;
}) {
  if (!transaction) return null;

  const { actual, envelopeTitle, envelopeType } = transaction;
  const isCash = Boolean(actual.cash);
  const isIncome = actual.cash?.kind === 'income';
  const onDark = envelopeType !== 'variable';

  return (
    <Sheet open={open} onClose={onClose} labelledBy="txn-sheet-label">
      <div className="envelope" data-type={envelopeType}>
        <div className="sheet-head" data-on-dark={onDark}>
          <p className="label" id="txn-sheet-label">{sheetLabel(envelopeType, envelopeTitle, isCash)}</p>
          <Amount value={actual.amountIls} className="figure" />
          <p className="meta">{actual.businessName}</p>
          {isCash ? (
            <p className="meta">
              {[actual.cash?.memberName, walletName, actual.cash?.inputKind === 'voice' ? 'הקלטה' : null, actual.cash?.status === 'needs_review' ? 'ממתין לאישור' : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : merchantLine(actual) !== actual.businessName ? (
            <p className="meta">{merchantLine(actual).replace(actual.businessName, '').trim()}</p>
          ) : null}
          <p className="meta">{shortDate(actual.transactionDate)}</p>
        </div>
      </div>

      <div className="sheet-body">
        {isCash ? (
          isIncome ? (
            <>
              <ActionRow icon={<Note />} label="להוסיף הערה" onClick={() => onCashAction('note')} />
              <ActionRow icon={<Scissors />} label="לפצל את ההכנסה" onClick={() => onCashAction('split')} />
              <ActionRow icon={<Calendar />} label="להזיז את העסקה לחודש אחר" onClick={() => onCashAction('month')} />
              <ActionRow icon={<Tag />} label="לערוך — סכום, מקור, תאריך, ארנק" onClick={onEditCash} />
              <ActionRow icon={<Scissors />} label="למחוק את הרישום" danger onClick={onDeleteCash} />
            </>
          ) : (
            <>
              <ActionRow icon={<Note />} label="להוסיף הערה" onClick={() => onCashAction('note')} />
              <ActionRow icon={<Move />} label="להזיז את ההוצאה" onClick={() => onCashAction('move')} />
              <ActionRow icon={<Scissors />} label="לפצל את ההוצאה" onClick={() => onCashAction('split')} />
              <ActionRow icon={<Calendar />} label="להזיז את העסקה לחודש אחר" onClick={() => onCashAction('month')} />
              {envelopeType !== 'riseupGoal' ? (
                <ActionRow icon={<Coins />} label="זו הפקדה לחיסכון!" onClick={onSavings} />
              ) : null}
              <ActionRow icon={<Tag />} label="לערוך — סכום, קטגוריה, תאריך, ארנק" onClick={onEditCash} />
              <ActionRow icon={<Scissors />} label="למחוק את הרישום" danger onClick={onDeleteCash} />
            </>
          )
        ) : (
          <>
            <ActionRow icon={<Note />} label="להוסיף הערה" disabled />
            <ActionRow icon={<Move />} label="להזיז את ההוצאה" disabled />
            <ActionRow icon={<Scissors />} label="לפצל את ההוצאה" disabled />
            <ActionRow icon={<Calendar />} label="להזיז את העסקה לחודש אחר" disabled />
            <ActionRow icon={<Coins />} label="זו הפקדה לחיסכון!" disabled />
            <p style={{ color: 'var(--muted)', fontSize: 14, padding: '4px 8px 12px' }}>
              עריכת עסקאות רייזאפ אפשרית רק באפליקציה של רייזאפ — הגישה שלנו לנתונים היא לקריאה בלבד.
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}

function ActionRow({
  icon, label, disabled, danger, onClick,
}: { icon: React.ReactNode; label: string; disabled?: boolean; danger?: boolean; onClick?: () => void }) {
  return (
    <button
      className="action-row"
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={disabled ? { color: 'var(--muted)', borderColor: '#f1f1f1' } : danger ? { color: 'var(--alert)' } : undefined}
    >
      <span className="ico">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
