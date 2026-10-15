'use client';

import { useState, type ComponentProps } from 'react';

import { WalletCard } from '@/app/dashboard/components/WalletCard';
import { WalletInflowSheet } from '@/app/dashboard/components/WalletInflow';

type CardProps = ComponentProps<typeof WalletCard>;

/**
 * The wallet card with the sheets only it opens: "צפוי להיכנס" and (with
 * the ⋮) the wallet menu. Everything shared with the envelopes — the cash
 * entry sheet, the wallets sheet, the transaction sheet — stays with the
 * envelope list, which passes the callbacks in.
 */
export function WalletSection(props: Omit<CardProps, 'onEditInflow'>) {
  const [sheet, setSheet] = useState<'inflow' | null>(null);
  const { wallet } = props;
  return (
    <>
      <WalletCard {...props} onEditInflow={() => setSheet('inflow')} />
      {sheet === 'inflow' && wallet.inflow ? <WalletInflowSheet inflow={wallet.inflow} onClose={() => setSheet(null)} /> : null}
    </>
  );
}
