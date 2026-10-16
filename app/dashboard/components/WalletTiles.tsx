'use client';

import { Amount } from '@/app/dashboard/components/Amount';
import type { WalletSummary } from '@/lib/dashboard/data';

/**
 * The wallet card's wallets, as tiles: the name, the balance big, a small
 * "ברירת מחדל" pill on the default one. Two to a row on a phone; tapping a
 * tile opens that wallet's own settings.
 */
export function WalletTiles({
  wallets,
  onOpen,
}: {
  wallets: WalletSummary[];
  onOpen?: (walletId: string) => void;
}) {
  return (
    <div className="wallet-tiles">
      {wallets.map((w) => (
        <button key={w.id} type="button" className="wallet-tile" onClick={() => onOpen?.(w.id)} aria-label={`הגדרות ${w.name}`}>
          <span className="wallet-tile-head">
            <span className="wallet-tile-name">{w.name}</span>
            {w.isDefault ? <span className="wallet-tag">ברירת מחדל</span> : null}
          </span>
          <Amount value={w.balance} className={w.balance < 0 ? 'wallet-tile-balance is-negative' : 'wallet-tile-balance'} />
          {w.memberName ? <span className="wallet-tile-owner">של {w.memberName}</span> : null}
        </button>
      ))}
    </div>
  );
}
