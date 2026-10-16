'use client';

import { useState, useTransition } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { ChevronLeft } from '@/app/dashboard/components/icons';
import { Sheet } from '@/app/dashboard/components/Sheet';
import { WalletSettingsSheet, type WalletPanel } from '@/app/dashboard/components/WalletSettingsSheet';
import { createWallet, transferBetweenWallets } from '@/lib/cash/actions';
import type { MoneySource } from '@/lib/cash/wallet-actions';
import type { WalletMovement, WalletSummary } from '@/lib/dashboard/data';
import { isoDateInIsrael } from '@/lib/dates';
import type { HouseholdMember } from '@/lib/types';

/** Where the wallets sheet opens: the list, or straight into one wallet's settings. */
export interface WalletsSheetFocus {
  walletId?: string;
  panel?: WalletPanel;
  /** The add panel's starting source ("משיכה מהכספומט" asks which wallet). */
  source?: MoneySource;
  /** Open on "העברה בין ארנקים" rather than the list. */
  tab?: 'list' | 'transfer';
}

/**
 * Manage wallets, and move cash between them. Tapping a wallet opens its own
 * settings screen (WalletSettingsSheet).
 */
export function WalletsSheet({
  wallets,
  members,
  movements = [],
  focus = null,
  incomeCategories,
  onClose,
}: {
  wallets: WalletSummary[];
  members: Pick<HouseholdMember, 'id' | 'display_name'>[];
  /** This month's wallet movements; the settings screen lists its balance updates. */
  movements?: WalletMovement[];
  focus?: WalletsSheetFocus | null;
  /** Cash income categories, for money added as income. */
  incomeCategories?: string[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'list' | 'transfer'>(focus?.tab === 'transfer' && wallets.length > 1 ? 'transfer' : 'list');
  const [settings, setSettings] = useState<{ walletId: string; panel: WalletPanel | null } | null>(
    focus?.walletId ? { walletId: focus.walletId, panel: focus.panel ?? null } : null,
  );
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

  const settingsWallet = settings ? wallets.find((w) => w.id === settings.walletId) : undefined;
  if (settings && settingsWallet) {
    return (
      <WalletSettingsSheet
        key={settingsWallet.id}
        wallet={settingsWallet}
        adjustments={movements.filter((m) => m.kind === 'adjustment' && m.walletId === settingsWallet.id)}
        initialPanel={settings.panel}
        initialSource={focus?.source}
        wallets={wallets}
        incomeCategories={incomeCategories}
        onBack={() => setSettings(null)}
        onClose={onClose}
      />
    );
  }

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
              <WalletRow key={w.id} wallet={w} onOpen={() => setSettings({ walletId: w.id, panel: null })} />
            ))}
            <p className="field-hint wallet-list-hint">לחצו על ארנק כדי להוסיף לו כסף, לעדכן כמה יש בו, לשנות שם או להסיר.</p>

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

function WalletRow({ wallet, onOpen }: { wallet: WalletSummary; onOpen: () => void }) {
  return (
    <button type="button" className="wallet-row wallet-row--button" onClick={onOpen} aria-label={`הגדרות ${wallet.name}`}>
      <span className="wallet-row-main">
        <span className="wallet-name">
          <span className="wallet-row-name">{wallet.name}</span>
          {wallet.isDefault ? <span className="wallet-tag">ברירת מחדל</span> : null}
          {wallet.memberName ? <span className="wallet-tag">{wallet.memberName}</span> : null}
        </span>
        <Amount value={wallet.balance} className={wallet.balance < 0 ? 'wallet-balance is-negative' : 'wallet-balance'} />
        <span className="wallet-row-chev" aria-hidden="true"><ChevronLeft size={20} /></span>
      </span>
    </button>
  );
}
