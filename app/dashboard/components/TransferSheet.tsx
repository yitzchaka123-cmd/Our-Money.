'use client';

import { useState, useTransition } from 'react';

import { Sheet } from '@/app/dashboard/components/Sheet';
import { deleteTransfer, updateTransfer } from '@/lib/cash/actions';
import type { WalletMovement, WalletSummary } from '@/lib/dashboard/data';

/** A move between wallets, opened from the wallet card: change it or undo it. */
export function TransferSheet({
  transfer,
  wallets,
  onClose,
}: {
  transfer: WalletMovement;
  wallets: WalletSummary[];
  onClose: () => void;
}) {
  const [from, setFrom] = useState(transfer.fromWalletId ?? wallets[0]?.id ?? '');
  const [to, setTo] = useState(transfer.toWalletId ?? wallets[1]?.id ?? '');
  const [amount, setAmount] = useState<number | ''>(transfer.amountIls);
  const [date, setDate] = useState(transfer.date);
  const [note, setNote] = useState(transfer.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (task: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const result = await task();
      if (result.ok) onClose();
      else setError(result.error ?? 'משהו השתבש.');
    });

  const walletChips = (value: string, onPick: (id: string) => void, exclude: string) => (
    <div className="chips">
      {wallets.map((w) => (
        <button
          key={w.id}
          type="button"
          className="chip"
          data-selected={w.id === value}
          disabled={w.id === exclude}
          onClick={() => onPick(w.id)}
        >
          {w.name}
        </button>
      ))}
    </div>
  );

  return (
    <Sheet open onClose={onClose} labelledBy="transfer-title">
      <div className="sheet-body">
        <h2 className="sheet-title" id="transfer-title">העברה בין ארנקים</h2>

        <div className="field">
          <span>מאיזה ארנק</span>
          {walletChips(from, setFrom, to)}
        </div>
        <div className="field">
          <span>לאיזה ארנק</span>
          {walletChips(to, setTo, from)}
        </div>
        <label className="field">
          <span>סכום</span>
          <input type="number" inputMode="decimal" min="0" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))} />
        </label>
        <label className="field">
          <span>תאריך</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>הערה</span>
          <input type="text" value={note} placeholder="הערה" onChange={(e) => setNote(e.target.value)} />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <button
          className="btn"
          type="button"
          disabled={pending}
          onClick={() =>
            run(() =>
              updateTransfer(transfer.id, {
                fromWalletId: from,
                toWalletId: to,
                amountIls: amount === '' ? 0 : amount,
                date,
                note: note || null,
              }),
            )
          }
        >
          שמירה
        </button>
        {confirmDelete ? (
          <button className="btn-ghost btn-danger" type="button" disabled={pending} onClick={() => run(() => deleteTransfer(transfer.id))}>
            כן, לבטל את ההעברה
          </button>
        ) : (
          <button className="btn-ghost" type="button" disabled={pending} onClick={() => setConfirmDelete(true)}>
            ביטול ההעברה
          </button>
        )}
      </div>
    </Sheet>
  );
}
