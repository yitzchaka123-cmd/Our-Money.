'use client';

import { useState } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { ChevronDown, Kebab } from '@/app/dashboard/components/icons';
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
}: {
  wallet: WalletView;
  onOpenMovement?: (movement: WalletMovement) => void;
  onManage?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const several = wallet.wallets.length > 1;

  return (
    <article className="card wallet">
      <div className="card-body">
        <div className="card-head">
          <h2 className="card-title">{several ? 'ארנקי מזומן' : 'ארנק מזומן'}</h2>
          <span onClick={onManage} role="presentation">
            <Kebab label="ניהול ארנקים" />
          </span>
        </div>
        <p className="figure-label">{several ? 'סה״כ במזומן' : 'בארנק עכשיו'}</p>
        <Amount value={wallet.balance} className={wallet.balance < 0 ? 'account-figure is-negative' : 'account-figure'} />

        {several ? (
          <ul className="wallet-list">
            {wallet.wallets.map((w) => (
              <li key={w.id}>
                <span className="wallet-list-name">
                  {w.name}
                  {w.memberName ? <span className="pill">{w.memberName}</span> : null}
                </span>
                <Amount value={w.balance} className={w.balance < 0 ? 'wallet-list-balance is-negative' : 'wallet-list-balance'} />
              </li>
            ))}
          </ul>
        ) : null}

        <div className="wallet-flows">
          <div><p className="figure-label">נמשך החודש</p><Amount value={wallet.withdrawn} className="figure-expected" /></div>
          <div><p className="figure-label">נכנס במזומן</p><Amount value={wallet.income} className="figure-expected" /></div>
          <div><p className="figure-label">יצא במזומן</p><Amount value={wallet.spent} className="figure-expected" /></div>
        </div>
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
              disabled={m.kind === 'withdrawal'}
              onClick={() => onOpenMovement?.(m)}
            >
              <span className="date">{shortDate(m.date)}</span>
              <span className="amount">
                <span className="flow-sign" aria-hidden="true">{m.kind === 'spend' ? '−' : m.kind === 'transfer' ? '⇄' : '+'}</span>
                <Amount value={m.amountIls} />
              </span>
              <span className="kebab" aria-hidden="true"><span /><span /><span /></span>
              <span className="merchant">
                {m.label}
                {m.memberName ? ` · ${m.memberName}` : ''}
                {m.kind === 'withdrawal' ? ' · משיכה' : ''}
                {several && m.walletName && m.kind !== 'transfer' ? ` · ${m.walletName}` : ''}
              </span>
            </button>
          ))}
        </div>
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
