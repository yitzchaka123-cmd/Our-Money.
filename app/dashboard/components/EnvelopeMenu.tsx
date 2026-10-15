'use client';

import type { ReactNode } from 'react';

import { Sheet } from '@/app/dashboard/components/Sheet';
import { ActionRow } from '@/app/dashboard/components/TransactionSheet';
import { Calendar, Chart, Coins, Move, Tag } from '@/app/dashboard/components/icons';
import { Bars, Pencil, Plus, Stack, TextSize, Trash } from '@/app/dashboard/components/icons-extra';
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
  | 'hide'
  // Income: RiseUp's own, with the expected figure kept on our side.
  | 'income-target'
  | 'move-incomes'
  | 'add-income';

interface MenuItem {
  action: EnvelopeMenuAction;
  label: string;
  icon: ReactNode;
}

/**
 * What the card's ⋮ offers, in RiseUp's order. A tracker and RiseUp's income
 * get RiseUp's own menu — changes kept on our side, because RiseUp's API is
 * read-only — and every envelope that takes cash gets the cash side, which is
 * ours. Exported for the tests.
 */
export function menuItems(envelope: EnvelopeView): MenuItem[] {
  const items: MenuItem[] = [];
  const cashIncomes = envelope.actuals.filter((a) => a.cash?.kind === 'income').length;
  const cashSpends = envelope.actuals.filter((a) => a.cash?.kind === 'spend').length;

  if (envelope.type === 'variableIncome') {
    return [
      { action: 'history', label: 'חודשים קודמים', icon: <Bars /> },
      { action: 'income-target', label: 'עדכון הכנסה צפויה', icon: <Pencil filled /> },
      { action: 'move-incomes', label: 'העברת כמה הכנסות יחד', icon: <Stack /> },
      { action: 'add-income', label: 'הוספת הכנסה', icon: <Plus bold /> },
    ];
  }

  // RiseUp's fixed income takes no cash: only its earlier months.
  if (envelope.type === 'fixedIncome') return [{ action: 'history', label: 'חודשים קודמים', icon: <Chart /> }];

  if (envelope.type === 'trackingCategory') {
    items.push(
      { action: 'history', label: 'חודשים קודמים', icon: <Bars /> },
      { action: 'edit-target', label: 'עריכת סכום', icon: <Pencil filled /> },
      { action: 'rename', label: 'עריכת שם', icon: <TextSize /> },
      { action: 'hide', label: 'מחיקה מהתזרים', icon: <Trash filled /> },
    );
  }

  const income = envelope.type === 'cashIncome';
  items.push(
    { action: 'add-cash', label: income ? 'הוספת הכנסה במזומן' : 'הוספת הוצאה במזומן כאן', icon: <Coins /> },
    {
      action: 'add-plan',
      label: income ? 'הכנסה צפויה במזומן — קבועה או חד־פעמית' : 'הוצאה צפויה במזומן — קבועה או חד־פעמית',
      icon: <Calendar />,
    },
  );
  if (income && cashIncomes > 1) items.push({ action: 'move-incomes', label: 'העברת כמה הכנסות יחד', icon: <Stack /> });
  if (!income && cashSpends > 1) items.push({ action: 'bulk-move', label: 'להזיז כמה הוצאות מזומן יחד', icon: <Move /> });
  if (envelope.type !== 'trackingCategory') items.push({ action: 'history', label: 'חודשים קודמים', icon: <Chart /> });
  items.push({ action: 'plans', label: 'כל התכנונים במזומן', icon: <Tag /> });
  return items;
}

function hint(envelope: EnvelopeView): string {
  if (envelope.type === 'trackingCategory') {
    return 'שינוי סכום, שם או מחיקה נשמרים אצלנו בלבד — רייזאפ לא מתעדכנת, כי הגישה שלנו אליה היא לקריאה בלבד.';
  }
  if (envelope.type === 'variableIncome') {
    return 'הכנסות מרייזאפ נשארות כמו שהן — הגישה שלנו אליה היא לקריאה בלבד. הצפי שתעדכנו נשמר אצלנו, ורק הכנסות במזומן אפשר להזיז.';
  }
  if (envelope.type === 'fixedIncome') {
    return 'הכנסות שסימנתם ברייזאפ כהכנסה קבועה. הן מגיעות מרייזאפ כמו שהן — הגישה שלנו אליה היא לקריאה בלבד.';
  }
  return 'שינוי התקציב עצמו נעשה באפליקציה של RiseUp — הגישה שלנו לנתונים שלהם היא לקריאה בלבד.';
}

/** The card's ⋮, as a bottom sheet of outlined rows. */
export function EnvelopeMenu({
  envelope,
  onPick,
  onClose,
}: {
  envelope: EnvelopeView;
  onPick: (action: EnvelopeMenuAction) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open onClose={onClose} labelledBy="envelope-menu-title">
      <div className="sheet-body">
        <h2 className="sheet-title" id="envelope-menu-title">{envelope.title}</h2>
        {menuItems(envelope).map((item) => (
          <ActionRow key={`${item.action}-${item.label}`} icon={item.icon} label={item.label} onClick={() => onPick(item.action)} />
        ))}
        <p className="menu-hint">{hint(envelope)}</p>
      </div>
    </Sheet>
  );
}
