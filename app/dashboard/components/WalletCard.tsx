'use client';

import { useState } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { ChevronDown, Kebab } from '@/app/dashboard/components/icons';
import { WalletInflowLine } from '@/app/dashboard/components/WalletInflow';
import { WalletTiles } from '@/app/dashboard/components/WalletTiles';
import type { WalletMovement, WalletView } from '@/lib/dashboard/data';
import { shortDate } from '@/app/dashboard/components/EnvelopeCard';

/**
 * The cash bank: what should physically be in cash right now — across every
 * wallet, and per wallet when there is more than one — plus this month's flows
 * and movements. The ⋮ opens wallet management and transfers.
 */
export function WalletCard({
  wallet,
  onOpenMovement,
  onManage,
  onAddWithdrawal,
  onAddMoney,
  onAddSpend,
  onEditInflow,
  onMenu,
  onOpenWallet,
}: {
  wallet: WalletView;
  onOpenMovement?: (movement: WalletMovement) => void;
  onManage?: () => void;
  onAddWithdrawal?: () => void;
  /** A cash expense: the cash entry sheet. */
  onAddSpend?: () => void;
  /** "עדכון כמה צפוי להיכנס". */
  onEditInflow?: () => void;
  /** The ⋮: the wallet menu. Without it the ⋮ opens wallet management. */
  onMenu?: () => void;
  /** Add money to a wallet, or set how much is in it — the wallet's own settings. */
  onAddMoney?: () => void;
  onOpenWallet?: (walletId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const several = wallet.wallets.length > 1;

  return (
    <article className="card wallet">
      <div className="card-body">
        <div className="card-head">
          <h2 className="card-title">{several ? 'ארנקי מזומן' : 'ארנק מזומן'}</h2>
          {onMenu ? (
            <Kebab label="תפריט הארנק" onClick={onMenu} />
          ) : (
            <span onClick={onManage} role="presentation">
              <Kebab label="ניהול ארנקים" />
            </span>
          )}
        </div>
        <p className="figure-label">{several ? 'סה״כ במזומן' : 'בארנק עכשיו'}</p>
        <Amount value={wallet.balance} className={wallet.balance < 0 ? 'account-figure is-negative' : 'account-figure'} />

        {several ? <WalletTiles wallets={wallet.wallets} onOpen={onOpenWallet} /> : null}

        <div className="wallet-flows">
          <div><p className="figure-label">נמשך החודש</p><Amount value={wallet.withdrawn} className="figure-expected" /></div>
          <div><p className="figure-label">נכנס במזומן</p><Amount value={wallet.income} className="figure-expected" /></div>
          <div><p className="figure-label">יצא במזומן</p><Amount value={wallet.spent} className="figure-expected" /></div>
        </div>
        {wallet.inflow ? <WalletInflowLine inflow={wallet.inflow} onEdit={onEditInflow} /> : null}
        {wallet.balance < 0 ? (
          <p className="wallet-warning">נרשמו יותר הוצאות ממה שנכנס — כנראה חסרה משיכה או הכנסה במזומן.</p>
        ) : null}
      </div>

      <button className="expander" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>תנועות החודש</span>
        <span className="chev"><ChevronDown /></span>
      </button>

      {open ? (
        <div className="breakdown">
          {wallet.movements.length === 0 ? <p className="picker-empty">אין עדיין תנועות מזומן החודש.</p> : null}
          {wallet.movements.map((m) => (
            <button
              key={`${m.kind}-${m.id}`}
              type="button"
              className="txn-row wallet-row-mv"
              data-kind={m.kind}
              onClick={() => onOpenMovement?.(m)}
            >
              <span className="date">{shortDate(m.date)}</span>
              <span className="amount">
                <span className="flow-sign" aria-hidden="true">{flowSign(m)}</span>
                <Amount value={m.kind === 'adjustment' ? Math.abs(m.amountIls) : m.amountIls} />
              </span>
              <span className="kebab" aria-hidden="true"><span /><span /><span /></span>
              <span className="merchant">
                {m.label}
                {m.memberName ? ` · ${m.memberName}` : ''}
                {m.kind === 'withdrawal' ? ' · משיכה' : ''}
                {m.kind === 'adjustment' && m.label !== 'עדכון יתרה' ? ' · עדכון יתרה' : ''}
                {several && m.walletName && m.kind !== 'transfer' ? ` · ${m.walletName}` : ''}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Money in is green, money out red, an ATM withdrawal purple. Cash
          income is one of the sources under "הוספת כסף לארנק". */}
      {onAddMoney ? (
        <button className="add-row add-row--inline" type="button" onClick={onAddMoney}>
          <span className="add-plus add-plus--income" aria-hidden="true">+</span>
          <span>הוספת כסף לארנק</span>
        </button>
      ) : null}
      {onAddSpend ? (
        <button className="add-row add-row--inline" type="button" onClick={onAddSpend}>
          <span className="add-plus add-plus--spend" aria-hidden="true">−</span>
          <span>הוספת הוצאה במזומן</span>
        </button>
      ) : null}
      {onAddWithdrawal ? (
        <button className="add-row add-row--inline" type="button" onClick={onAddWithdrawal}>
          <span className="add-plus add-plus--withdrawal" aria-hidden="true">+</span>
          <span>רישום משיכה מהכספומט</span>
        </button>
      ) : null}
      {onManage ? (
        <button className="add-row add-row--inline" type="button" onClick={onManage}>
          <span className="add-plus" aria-hidden="true">⇄</span>
          <span>{several ? 'ניהול ארנקים והעברות' : 'להוסיף עוד ארנק'}</span>
        </button>
      ) : null}
    </article>
  );
}

function flowSign(m: WalletMovement): string {
  if (m.kind === 'spend') return '−';
  if (m.kind === 'transfer') return '⇄';
  if (m.kind === 'adjustment') return m.amountIls < 0 ? '−' : '+';
  return '+';
}
