'use client';

import { useState } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { ChevronDown } from '@/app/dashboard/components/icons';
import type { WalletMovement, WalletView } from '@/lib/dashboard/data';
import { shortDate } from '@/app/dashboard/components/EnvelopeCard';

/**
 * The cash bank: what should physically be in the wallet, and this month's
 * movements in and out of it. Styled as an account card, like the balances on
 * מצב העו״ש, because that is what it is.
 */
export function WalletCard({
  wallet,
  onOpenMovement,
}: {
  wallet: WalletView;
  onOpenMovement?: (movement: WalletMovement) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <article className="card wallet">
      <div className="card-body">
        <div className="card-head">
          <h2 className="card-title">ארנק מזומן</h2>
        </div>
        <p className="figure-label">בארנק עכשיו</p>
        <Amount
          value={wallet.balance}
          className={wallet.balance < 0 ? 'account-figure is-negative' : 'account-figure'}
        />
        <div className="wallet-flows">
          <div>
            <p className="figure-label">נמשך החודש</p>
            <Amount value={wallet.withdrawn} className="figure-expected" />
          </div>
          <div>
            <p className="figure-label">נכנס במזומן</p>
            <Amount value={wallet.income} className="figure-expected" />
          </div>
          <div>
            <p className="figure-label">יצא במזומן</p>
            <Amount value={wallet.spent} className="figure-expected" />
          </div>
        </div>
        {wallet.balance < 0 ? (
          <p className="wallet-warning">
            נרשמו יותר הוצאות ממה שנמשך — כנראה חסרה משיכה או הכנסה במזומן.
          </p>
        ) : null}
      </div>

      <button
        className="expander"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>תנועות החודש</span>
        <span className="chev">
          <ChevronDown />
        </span>
      </button>

      {open ? (
        <div className="breakdown">
          {wallet.movements.length === 0 ? (
            <p className="picker-empty">אין עדיין תנועות מזומן החודש.</p>
          ) : null}
          {wallet.movements.map((m) => (
            <button
              key={`${m.kind}-${m.id}`}
              type="button"
              className="txn-row wallet-row"
              data-kind={m.kind}
              disabled={m.kind === 'withdrawal'}
              onClick={() => onOpenMovement?.(m)}
            >
              <span className="date">{shortDate(m.date)}</span>
              <span className="amount">
                <span className="flow-sign" aria-hidden="true">
                  {m.kind === 'spend' ? '−' : '+'}
                </span>
                <Amount value={m.amountIls} />
              </span>
              <span className="kebab" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="merchant">
                {m.label}
                {m.memberName ? ` · ${m.memberName}` : ''}
                {m.kind === 'withdrawal' ? ' · משיכה' : ''}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}
