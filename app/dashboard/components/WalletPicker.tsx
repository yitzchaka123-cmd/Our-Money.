'use client';

import type { WalletSummary } from '@/lib/dashboard/data';

/**
 * "לאיזה ארנק נכנס הכסף?" — one chip per wallet, the chosen one (or the
 * default wallet when nothing is chosen yet) picked. Asked every time an ATM
 * withdrawal is recorded, even with a single wallet, so the answer is never a
 * silent guess.
 */
export function WalletPicker({
  wallets,
  value,
  onChange,
  title = 'לאיזה ארנק נכנס הכסף?',
}: {
  wallets: WalletSummary[];
  value: string | null;
  onChange: (walletId: string) => void;
  title?: string;
}) {
  const picked = value ?? wallets.find((w) => w.isDefault)?.id ?? wallets[0]?.id ?? null;
  return (
    <div className="field wallet-picker" role="group" aria-label={title}>
      <span>{title}</span>
      <div className="chips">
        {wallets.map((w) => (
          <button key={w.id} type="button" className="chip" data-selected={picked === w.id} onClick={() => onChange(w.id)}>
            {w.name}
          </button>
        ))}
      </div>
    </div>
  );
}
