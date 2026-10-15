'use client';

import type { ReactNode } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { Move } from '@/app/dashboard/components/icons';
import { Bars, Pencil, Plus, Wallet } from '@/app/dashboard/components/icons-extra';
import { Popup } from '@/app/dashboard/components/Popup';
import { Sheet } from '@/app/dashboard/components/Sheet';
import { shortMonth } from '@/app/dashboard/components/TrackerHistorySheet';
import { ActionRow } from '@/app/dashboard/components/TransactionSheet';
import type { WalletView } from '@/lib/dashboard/data';
import { monthParts } from '@/lib/money';

export type WalletMenuAction = 'history' | 'inflow' | 'add-money' | 'transfer' | 'manage';

interface MenuItem {
  action: WalletMenuAction;
  label: string;
  icon: ReactNode;
}

/**
 * The wallet card's ⋮, shaped like the income card's (חודשים קודמים / עדכון
 * הכנסה צפויה / … / הוספת הכנסה), for cash. Exported for the tests.
 */
export function walletMenuItems(wallet: WalletView): MenuItem[] {
  return [
    { action: 'history', label: 'חודשים קודמים', icon: <Bars /> },
    { action: 'inflow', label: 'עדכון כמה צפוי להיכנס', icon: <Pencil filled /> },
    { action: 'add-money', label: 'הוספת כסף לארנק', icon: <Plus bold /> },
    ...(wallet.wallets.length > 1 ? [{ action: 'transfer' as const, label: 'העברה בין ארנקים', icon: <Move /> }] : []),
    { action: 'manage', label: 'ניהול ארנקים', icon: <Wallet /> },
  ];
}

export function WalletMenu({
  wallet,
  onPick,
  onClose,
}: {
  wallet: WalletView;
  onPick: (action: WalletMenuAction) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open onClose={onClose} labelledBy="wallet-menu-title">
      <div className="sheet-body">
        <h2 className="sheet-title" id="wallet-menu-title">{wallet.wallets.length > 1 ? 'ארנקי מזומן' : 'ארנק מזומן'}</h2>
        {walletMenuItems(wallet).map((item) => (
          <ActionRow key={item.action} icon={item.icon} label={item.label} onClick={() => onPick(item.action)} />
        ))}
        <p className="menu-hint">המזומן נרשם אצלנו בלבד — רייזאפ רואה רק את המשיכות מהבנק.</p>
      </div>
    </Sheet>
  );
}

function whole(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/**
 * "חודשים קודמים" for cash: five months of cash in (green) and out (red),
 * oldest on the right, this month on the left — RiseUp's month chart, with
 * the two flows side by side.
 */
export function WalletHistorySheet({ wallet, onClose }: { wallet: WalletView; onClose: () => void }) {
  const months = wallet.history ?? [];
  const peak = Math.max(1, ...months.map((m) => Math.max(m.in, m.out)));
  const HEIGHT = 120;
  const h = (v: number) => (v > 0 ? Math.max(Math.round((v / peak) * HEIGHT), 6) : 2);
  const current = months[months.length - 1];
  return (
    <Popup
      onClose={onClose}
      labelledBy="wallet-history-title"
      title="מזומן לפי חודשים"
      footer={
        <button className="popup-link" type="button" onClick={onClose}>
          הבנתי, תודה
        </button>
      }
    >
      <div className="bars-card">
        <div className="cash-bars">
          {months.map((m) => (
            <div key={m.month} className="cash-bars-month" data-current={m === current}>
              <div className="cash-bars-pair">
                <div className="cash-bars-col">
                  <span className="cash-bars-value">{whole(m.in)}</span>
                  <span className="cash-bars-bar is-in" style={{ height: h(m.in) }} />
                </div>
                <div className="cash-bars-col">
                  <span className="cash-bars-value">{whole(m.out)}</span>
                  <span className="cash-bars-bar is-out" style={{ height: h(m.out) }} />
                </div>
              </div>
              <span className="cash-bars-label">{shortMonth(m.month)}</span>
            </div>
          ))}
        </div>
        <div className="cash-bars-legend">
          <span><i className="is-in" />נכנס</span>
          <span><i className="is-out" />יצא</span>
        </div>
      </div>
      {wallet.inflow ? (
        <p className="target-line">
          צפוי להיכנס ב{monthParts(wallet.inflow.month).name}:{' '}
          <strong>
            <Amount value={wallet.inflow.expected} decimals={0} />
          </strong>
        </p>
      ) : null}
      <p className="why-text">
        נכנס = משיכות מהכספומט והכנסות במזומן. יצא = הוצאות במזומן. העברות בין ארנקים ועדכוני יתרה לא נספרים.
      </p>
    </Popup>
  );
}
