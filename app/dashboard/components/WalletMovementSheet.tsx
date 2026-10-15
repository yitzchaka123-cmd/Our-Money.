'use client';

import { Amount } from '@/app/dashboard/components/Amount';
import { MoveMonthSheet, NoteSheet, type CashAction } from '@/app/dashboard/components/CashActionSheets';
import { shortDate } from '@/app/dashboard/components/EnvelopeCard';
import { Calendar, Note, Scissors, Tag } from '@/app/dashboard/components/icons';
import { Wallet } from '@/app/dashboard/components/icons-extra';
import { Sheet } from '@/app/dashboard/components/Sheet';
import { ActionRow } from '@/app/dashboard/components/TransactionSheet';
import type { WalletMovement } from '@/lib/dashboard/data';
import { movementActual } from '@/lib/dashboard/movement-transaction';

/**
 * The movement sheet, or the note / other-month sheet it opened. Kept here
 * so the envelope list only holds which movement is open.
 */
export function WalletMovementOverlays({
  open,
  months,
  onAction,
  onEdit,
  onDelete,
  onOpenWallet,
  onClose,
}: {
  open: { movement: WalletMovement; action: CashAction | null };
  months: string[];
  onAction: (action: CashAction) => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenWallet: () => void;
  onClose: () => void;
}) {
  const { movement, action } = open;
  // Withdrawals and money added both live with the top-ups: kind 'withdrawal'.
  if (action === 'note') return <NoteSheet actual={movementActual(movement)} kind="withdrawal" onClose={onClose} />;
  if (action === 'month') return <MoveMonthSheet actual={movementActual(movement)} kind="withdrawal" months={months} onClose={onClose} />;
  return (
    <WalletMovementSheet
      movement={movement}
      onClose={onClose}
      onAction={onAction}
      onEdit={onEdit}
      onDelete={onDelete}
      onOpenWallet={movement.kind === 'adjustment' ? onOpenWallet : undefined}
    />
  );
}

/**
 * The transaction sheet for the wallet rows that are not in any envelope: an
 * ATM withdrawal, or money put into a wallet. Same look as the transaction
 * sheet — a coloured header, then the actions — so every row in "תנועות
 * החודש" opens the same kind of surface.
 */
export function WalletMovementSheet({
  movement,
  onClose,
  onAction,
  onEdit,
  onDelete,
  onOpenWallet,
}: {
  movement: WalletMovement;
  onClose: () => void;
  /** Note, or move to another month: the shared cash action sheets. */
  onAction: (action: CashAction) => void;
  /** The cash entry sheet: amount, date and which wallet. */
  onEdit: () => void;
  onDelete: () => void;
  /** The wallet's own settings (balance updates only). */
  onOpenWallet?: () => void;
}) {
  const withdrawal = movement.kind === 'withdrawal';
  const added = movement.amountIls >= 0;
  const headerType = withdrawal ? 'trackingCategory' : added ? 'cashIncome' : 'fixed';
  const label = withdrawal
    ? `משיכה מהכספומט${movement.fromBank ? ' · מהבנק' : ''}`
    : added
      ? 'כסף שנוסף לארנק'
      : 'עדכון יתרה';

  return (
    <Sheet open onClose={onClose} labelledBy="movement-sheet-label">
      <div className="envelope" data-type={headerType}>
        <div className="sheet-head" data-on-dark="true">
          <p className="label" id="movement-sheet-label">{label}</p>
          <Amount value={Math.abs(movement.amountIls)} className="figure" />
          <p className="meta">{movement.label}</p>
          <p className="meta">{[movement.memberName, movement.walletName].filter(Boolean).join(' · ')}</p>
          <p className="meta">{shortDate(movement.date)}</p>
        </div>
      </div>

      <div className="sheet-body">
        <ActionRow icon={<Note />} label="להוסיף הערה" onClick={() => onAction('note')} />
        {withdrawal ? (
          <>
            <ActionRow icon={<Wallet />} label="לאיזה ארנק נכנס הכסף?" onClick={onEdit} />
            {!movement.fromBank ? (
              <>
                <ActionRow icon={<Calendar />} label="להזיז את העסקה לחודש אחר" onClick={() => onAction('month')} />
                <ActionRow icon={<Tag />} label="לערוך — סכום, תאריך, ארנק" onClick={onEdit} />
              </>
            ) : null}
            <ActionRow icon={<Scissors />} label={movement.fromBank ? 'זו לא משיכה' : 'למחוק את הרישום'} danger onClick={onDelete} />
            {movement.fromBank ? <p className="menu-hint">הסכום והתאריך מגיעים מהבנק דרך RiseUp.</p> : null}
          </>
        ) : (
          <>
            {onOpenWallet ? <ActionRow icon={<Wallet />} label="לעדכן כמה כסף יש בארנק" onClick={onOpenWallet} /> : null}
            <ActionRow icon={<Scissors />} label="לבטל את הרישום" danger onClick={onDelete} />
            <p className="menu-hint">ביטול מחזיר את הארנק לסכום שהיה בו לפני הרישום. שום דבר אחר לא משתנה.</p>
          </>
        )}
      </div>
    </Sheet>
  );
}
