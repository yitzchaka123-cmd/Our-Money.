'use client';

import { useState, useTransition } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { Sheet } from '@/app/dashboard/components/Sheet';
import {
  archiveWallet,
  createWallet,
  renameWallet,
  setDefaultWallet,
  transferBetweenWallets,
} from '@/lib/cash/actions';
import type { WalletSummary } from '@/lib/dashboard/data';
import { isoDateInIsrael } from '@/lib/intake/parse';
import type { HouseholdMember } from '@/lib/types';

/** Manage wallets, and move cash between them. */
export function WalletsSheet({
  wallets,
  members,
  onClose,
}: {
  wallets: WalletSummary[];
  members: Pick<HouseholdMember, 'id' | 'display_name'>[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'list' | 'transfer'>('list');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (task: () => Promise<{ ok: boolean; error?: string }>, close = false) =>
    start(async () => {
      setError(null);
      const result = await task();
      if (!result.ok) setError(result.error ?? 'משהו השתבש.');
      else if (close) onClose();
    });

  // New wallet
  const [newName, setNewName] = useState('');
  const [newOwner, setNewOwner] = useState<string | null>(null);

  // Transfer
  const [from, setFrom] = useState(wallets.find((w) => w.isDefault)?.id ?? wallets[0]?.id ?? '');
  const [to, setTo] = useState(wallets.find((w) => w.id !== from)?.id ?? '');
  const [amount, setAmount] = useState<number | ''>('');
  const [date, setDate] = useState(isoDateInIsrael());
  const [note, setNote] = useState('');

  return (
    <Sheet open onClose={onClose} labelledBy="wallets-title">
      <div className="sheet-body">
        <h2 className="sheet-title" id="wallets-title">ארנקי מזומן</h2>

        <div className="kind-toggle kind-toggle--ink" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'list'} onClick={() => setTab('list')}>הארנקים</button>
          <button type="button" role="tab" aria-selected={tab === 'transfer'} onClick={() => setTab('transfer')} disabled={wallets.length < 2}>
            העברה בין ארנקים
          </button>
        </div>

        {tab === 'list' ? (
          <>
            {wallets.map((w) => (
              <WalletRow key={w.id} wallet={w} pending={pending} run={run} canArchive={wallets.length > 1} />
            ))}

            <div className="wallet-new">
              <label className="field">
                <span>ארנק חדש</span>
                <input type="text" placeholder="למשל: הארנק של שרה, הכספת" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </label>
              {members.length > 1 ? (
                <div className="field">
                  <span>של מי</span>
                  <div className="chips">
                    <button type="button" className="chip" data-selected={newOwner === null} onClick={() => setNewOwner(null)}>משותף</button>
                    {members.map((m) => (
                      <button key={m.id} type="button" className="chip" data-selected={newOwner === m.id} onClick={() => setNewOwner(m.id)}>
                        {m.display_name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <button
                className="btn"
                type="button"
                disabled={pending || !newName.trim()}
                onClick={() => run(async () => {
                  const r = await createWallet(newName, newOwner);
                  if (r.ok) setNewName('');
                  return r;
                })}
              >
                הוספת ארנק
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="field">
              <span>מ</span>
              <select value={from} onChange={(e) => setFrom(e.target.value)}>
                {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>אל</span>
              <select value={to} onChange={(e) => setTo(e.target.value)}>
                {wallets.filter((w) => w.id !== from).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
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
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button
              className="btn"
              type="button"
              disabled={pending || !from || !to || from === to || !amount}
              onClick={() => run(() => transferBetweenWallets({ fromWalletId: from, toWalletId: to, amountIls: Number(amount), date, note: note || null }), true)}
            >
              להעביר
            </button>
          </>
        )}

        {error ? <p className="form-error" style={{ marginTop: 12 }}>{error}</p> : null}
      </div>
    </Sheet>
  );
}

function WalletRow({
  wallet,
  pending,
  run,
  canArchive,
}: {
  wallet: WalletSummary;
  pending: boolean;
  run: (task: () => Promise<{ ok: boolean; error?: string }>) => void;
  canArchive: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(wallet.name);

  return (
    <div className="wallet-row">
      <div className="wallet-row-main">
        {editing ? (
          <input
            className="wallet-rename"
            type="text"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { setEditing(false); if (name.trim() && name !== wallet.name) run(() => renameWallet(wallet.id, name)); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        ) : (
          <button type="button" className="wallet-name" onClick={() => setEditing(true)}>
            {wallet.name}
            {wallet.isDefault ? <span className="pill">ברירת מחדל</span> : null}
            {wallet.memberName ? <span className="pill">{wallet.memberName}</span> : null}
          </button>
        )}
        <Amount value={wallet.balance} className={wallet.balance < 0 ? 'wallet-balance is-negative' : 'wallet-balance'} />
      </div>
      <div className="wallet-row-actions">
        {!wallet.isDefault ? (
          <button type="button" className="link-btn" disabled={pending} onClick={() => run(() => setDefaultWallet(wallet.id))}>
            להפוך לברירת מחדל
          </button>
        ) : null}
        {!wallet.isDefault && canArchive ? (
          <button type="button" className="link-btn link-btn--danger" disabled={pending} onClick={() => run(() => archiveWallet(wallet.id))}>
            לארכב
          </button>
        ) : null}
      </div>
    </div>
  );
}
