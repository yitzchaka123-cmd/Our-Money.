'use client';

import { Sheet } from '@/app/dashboard/components/Sheet';
import { ActionRow } from '@/app/dashboard/components/TransactionSheet';
import { Calendar, Chart, Coins, Move, Tag } from '@/app/dashboard/components/icons';
import type { EnvelopeView } from '@/lib/dashboard/data';

export type EnvelopeMenuAction = 'add-cash' | 'add-plan' | 'history' | 'bulk-move' | 'plans';

/**
 * The card's ⋮. Everything that changes RiseUp's own plan stays in RiseUp —
 * the API is read-only — so this menu is about the cash side of the envelope,
 * plus its history, which we can read.
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
  const cashSpends = envelope.actuals.filter((a) => a.cash?.kind === 'spend').length;
  const takesCash = envelope.type !== 'variableIncome';

  return (
    <Sheet open onClose={onClose} labelledBy="envelope-menu-title">
      <div className="sheet-body">
        <h2 className="sheet-title" id="envelope-menu-title">{envelope.title}</h2>
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
        <ActionRow icon={<Chart />} label="חודשים קודמים" onClick={() => onPick('history')} />
        <ActionRow icon={<Tag />} label="כל התכנונים במזומן" onClick={() => onPick('plans')} />
        <p className="menu-hint">שינוי התקציב עצמו נעשה באפליקציה של RiseUp — הגישה שלנו לנתונים שלהם היא לקריאה בלבד.</p>
      </div>
    </Sheet>
  );
}
