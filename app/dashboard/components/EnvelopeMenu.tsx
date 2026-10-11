'use client';

import { Sheet } from '@/app/dashboard/components/Sheet';
import { ActionRow } from '@/app/dashboard/components/TransactionSheet';
import { Calendar, Chart, Coins, Move, Tag } from '@/app/dashboard/components/icons';
import { Bars, Pencil, TextSize, Trash } from '@/app/dashboard/components/icons-extra';
import type { EnvelopeView } from '@/lib/dashboard/data';

export type EnvelopeMenuAction =
  | 'add-cash'
  | 'add-plan'
  | 'history'
  | 'bulk-move'
  | 'plans'
  // Trackers: RiseUp's own four, kept on our side.
  | 'edit-target'
  | 'rename'
  | 'hide';

/**
 * The card's ⋮. A tracker gets RiseUp's own menu — previous months, change
 * the amount, rename, remove — kept on our side because RiseUp's API is
 * read-only; then the cash side of the envelope, which is ours.
 */
export function EnvelopeMenu({
  envelope,
  onPick,
  onClose,
}: {
  envelope: EnvelopeView;
  onPick: (action: EnvelopeMenuAction) => void;
  onClose: () => void;
}) {
  const income = envelope.type === 'cashIncome' || envelope.type === 'variableIncome';
  const tracker = envelope.type === 'trackingCategory';
  const cashSpends = envelope.actuals.filter((a) => a.cash?.kind === 'spend').length;
  const takesCash = envelope.type !== 'variableIncome';

  return (
    <Sheet open onClose={onClose} labelledBy="envelope-menu-title">
      <div className="sheet-body">
        <h2 className="sheet-title" id="envelope-menu-title">{envelope.title}</h2>
        {tracker ? (
          <>
            <ActionRow icon={<Bars />} label="חודשים קודמים" onClick={() => onPick('history')} />
            <ActionRow icon={<Pencil />} label="עריכת סכום" onClick={() => onPick('edit-target')} />
            <ActionRow icon={<TextSize />} label="עריכת שם" onClick={() => onPick('rename')} />
            <ActionRow icon={<Trash />} label="מחיקה מהתזרים" onClick={() => onPick('hide')} />
          </>
        ) : null}
        {takesCash ? (
          <>
            <ActionRow
              icon={<Coins />}
              label={income ? 'הוספת הכנסה במזומן' : 'הוספת הוצאה במזומן כאן'}
              onClick={() => onPick('add-cash')}
            />
            <ActionRow
              icon={<Calendar />}
              label={income ? 'הכנסה צפויה במזומן — קבועה או חד־פעמית' : 'הוצאה צפויה במזומן — קבועה או חד־פעמית'}
              onClick={() => onPick('add-plan')}
            />
          </>
        ) : null}
        {!income && cashSpends > 1 ? (
          <ActionRow icon={<Move />} label="להזיז כמה הוצאות מזומן יחד" onClick={() => onPick('bulk-move')} />
        ) : null}
        {!tracker ? <ActionRow icon={<Chart />} label="חודשים קודמים" onClick={() => onPick('history')} /> : null}
        <ActionRow icon={<Tag />} label="כל התכנונים במזומן" onClick={() => onPick('plans')} />
        <p className="menu-hint">
          {tracker
            ? 'שינוי סכום, שם או מחיקה נשמרים אצלנו בלבד — רייזאפ לא מתעדכנת, כי הגישה שלנו אליה היא לקריאה בלבד.'
            : 'שינוי התקציב עצמו נעשה באפליקציה של RiseUp — הגישה שלנו לנתונים שלהם היא לקריאה בלבד.'}
        </p>
      </div>
    </Sheet>
  );
}
