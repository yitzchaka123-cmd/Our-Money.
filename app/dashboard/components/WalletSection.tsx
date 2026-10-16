'use client';

import { useState, type ComponentProps } from 'react';

import { WalletCard } from '@/app/dashboard/components/WalletCard';
import { WalletInflowSheet } from '@/app/dashboard/components/WalletInflow';
import { WalletHistorySheet, WalletMenu, type WalletMenuAction } from '@/app/dashboard/components/WalletMenu';

type CardProps = ComponentProps<typeof WalletCard>;

/**
 * The wallet card with the sheets only it opens: its ⋮ menu, "חודשים
 * קודמים" and "צפוי להיכנס". Everything shared with the envelopes — the cash
 * entry sheet, the wallets sheet, the transaction sheet — stays with the
 * envelope list, which passes the callbacks in.
 */
export function WalletSection({
  onTransfer,
  initialSheet = null,
  ...props
}: Omit<CardProps, 'onEditInflow' | 'onMenu'> & {
  /** "העברה בין ארנקים" from the menu. */
  onTransfer?: () => void;
  /** Preview only: a sheet open from the start. */
  initialSheet?: 'menu' | 'history' | 'inflow' | null;
}) {
  const [sheet, setSheet] = useState<'menu' | 'history' | 'inflow' | null>(initialSheet);
  const { wallet } = props;
  const close = () => setSheet(null);

  const pick = (action: WalletMenuAction) => {
    if (action === 'history' || action === 'inflow') {
      setSheet(action);
      return;
    }
    close();
    if (action === 'add-money') props.onAddMoney?.();
    if (action === 'transfer') onTransfer?.();
    if (action === 'manage') props.onManage?.();
  };

  return (
    <>
      <WalletCard {...props} onEditInflow={() => setSheet('inflow')} onMenu={() => setSheet('menu')} />
      {sheet === 'menu' ? <WalletMenu wallet={wallet} onPick={pick} onClose={close} /> : null}
      {sheet === 'history' ? <WalletHistorySheet wallet={wallet} onClose={close} /> : null}
      {sheet === 'inflow' && wallet.inflow ? <WalletInflowSheet inflow={wallet.inflow} onClose={close} /> : null}
    </>
  );
}
