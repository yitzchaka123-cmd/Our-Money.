'use client';

import { useState, useTransition } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { shortDate } from '@/app/dashboard/components/EnvelopeCard';
import { ChevronRight, Close } from '@/app/dashboard/components/icons';
import { Pencil, Plus, Scale, Star, Trash } from '@/app/dashboard/components/icons-extra';
import { Sheet } from '@/app/dashboard/components/Sheet';
import { ActionRow } from '@/app/dashboard/components/TransactionSheet';
import { WalletPicker } from '@/app/dashboard/components/WalletPicker';
import { deleteCashEntry, renameWallet, setDefaultWallet } from '@/lib/cash/actions';
import { addMoneyToWallet, deleteWallet, setWalletBalance, type MoneySource } from '@/lib/cash/wallet-actions';
import type { WalletMovement, WalletSummary } from '@/lib/dashboard/data';
import { isoDateInIsrael } from '@/lib/dates';

export type WalletPanel = 'add' | 'set' | 'rename' | 'delete';

const SOURCES: { value: MoneySource; label: string; hint: string }[] = [
  { value: 'other', label: 'סתם כסף', hint: 'נכנס לארנק בלי לשנות את התזרים.' },
  { value: 'withdrawal', label: 'משיכה מהכספומט', hint: 'כשהמשיכה תופיע ברייזאפ היא תתחבר לרישום הזה ולא תיספר פעמיים.' },
  { value: 'income', label: 'הכנסה במזומן', hint: 'נספר בהכנסות במזומן של החודש.' },
];

/**
 * One wallet's own screen, opened from the wallets sheet or the wallet card:
 * add money, set how much is really in it now, rename, make default, remove.
 *
 * Setting the amount never edits history: the difference is saved as one
 * "עדכון יתרה" row, listed here with an undo.
 */
export function WalletSettingsSheet({
  wallet,
  adjustments = [],
  initialPanel = null,
  initialSource = 'other',
  wallets = [wallet],
  onBack,
  onClose,
}: {
  wallet: WalletSummary;
  /** This month's balance updates for this wallet, newest first. */
  adjustments?: WalletMovement[];
  initialPanel?: WalletPanel | null;
  /** Where added money comes from, when the add panel opens. */
  initialSource?: MoneySource;
  /** Every wallet: an ATM withdrawal asks which one the cash went into. */
  wallets?: WalletSummary[];
  onBack?: () => void;
  onClose: () => void;
}) {
  const [panel, setPanel] = useState<WalletPanel | null>(initialPanel);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [addAmount, setAddAmount] = useState<number | ''>('');
  const [addFrom, setAddFrom] = useState<MoneySource>(initialSource);
  // An ATM withdrawal can go into any wallet; this one is picked to start with.
  const [addWallet, setAddWallet] = useState<string>(wallet.id);
  const addTo = addFrom === 'withdrawal' ? addWallet : wallet.id;
  const addToName = wallets.find((w) => w.id === addTo)?.name ?? wallet.name;
  const [addNote, setAddNote] = useState('');
  const [addDate, setAddDate] = useState(isoDateInIsrael());
  const [target, setTarget] = useState<number | ''>(Math.max(wallet.balance, 0));
  const [name, setName] = useState(wallet.name);

  const open = (next: WalletPanel | null) => {
    setError(null);
    setDone(null);
    setPanel(next);
  };

  // On success the sheet stays open on the wallet, whose figures refresh with
  // the page, and says what happened; removing the wallet goes back instead.
  const run = (task: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    start(async () => {
      setError(null);
      const result = await task();
      if (!result.ok) {
        setError(result.error ?? 'משהו השתבש.');
        return;
      }
      if (after) {
        after();
        return;
      }
      setDone(success);
      setPanel(null);
      setAddAmount('');
      setAddNote('');
    });

  const difference = target === '' ? 0 : Math.round((Number(target) - wallet.balance) * 100) / 100;
  const deleteBlocked = wallet.isDefault
    ? 'זה ארנק ברירת המחדל. קודם הפכו ארנק אחר לברירת מחדל, ואז אפשר להסיר את זה.'
    : Math.abs(wallet.balance) >= 0.005
      ? 'יש עוד כסף בארנק. קודם העבירו אותו לארנק אחר או עדכנו את הסכום לאפס.'
      : null;

  return (
    <Sheet open onClose={onClose} labelledBy="wallet-settings-label">
      <div className="envelope" data-type="cashIncome">
        <div className="sheet-head" data-on-dark="true">
          <div className="entry-head-row">
            {onBack ? (
              <button className="entry-close wallet-back" type="button" aria-label="חזרה לכל הארנקים" onClick={onBack}>
                <ChevronRight size={22} />
              </button>
            ) : null}
            <p className="label" id="wallet-settings-label">
              הגדרות ארנק{wallet.isDefault ? ' · ברירת מחדל' : ''}
              {wallet.memberName ? ` · של ${wallet.memberName}` : ''}
            </p>
            <button className="entry-close" type="button" aria-label="סגירה" onClick={onClose}>
              <Close />
            </button>
          </div>
          <p className="wallet-settings-name">{wallet.name}</p>
          <Amount value={wallet.balance} className="figure" />
          <p className="meta">בארנק עכשיו, לפי מה שנרשם</p>
        </div>
      </div>

      <div className="sheet-body">
        {done ? <p className="wallet-done" role="status">{done}</p> : null}

        {panel === null ? (
          <>
            <ActionRow icon={<Plus />} label="הוספת כסף לארנק" onClick={() => open('add')} />
            <ActionRow icon={<Scale />} label="לעדכן כמה כסף יש בארנק עכשיו" onClick={() => open('set')} />
            <ActionRow icon={<Pencil />} label="שינוי שם" onClick={() => open('rename')} />
            {!wallet.isDefault ? (
              <ActionRow
                icon={<Star />}
                label="להפוך לארנק ברירת המחדל"
                onClick={() => run(() => setDefaultWallet(wallet.id), 'זה עכשיו ארנק ברירת המחדל.')}
              />
            ) : null}
            <ActionRow icon={<Trash />} label="להסיר את הארנק" danger onClick={() => open('delete')} />

            {adjustments.length > 0 ? (
              <div className="wallet-adjustments">
                <h3 className="picker-title">עדכוני יתרה החודש</h3>
                {adjustments.map((a) => (
                  <div key={a.id} className="wallet-adjustment">
                    <span className="date">{shortDate(a.date)}</span>
                    <span className="label">{a.label}</span>
                    <Amount value={a.amountIls} className={a.amountIls < 0 ? 'is-negative' : 'is-positive'} />
                    <button
                      type="button"
                      className="link-btn"
                      disabled={pending}
                      onClick={() => run(() => deleteCashEntry(a.id, 'withdrawal'), 'העדכון בוטל.')}
                    >
                      ביטול
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {panel === 'add' ? (
          <div className="wallet-panel">
            <h3 className="picker-title">הוספת כסף ל{addToName}</h3>
            <label className="field">
              <span>סכום</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                autoFocus
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </label>
            <div className="field">
              <span>מאיפה הכסף?</span>
              <div className="chips">
                {SOURCES.map((s) => (
                  <button key={s.value} type="button" className="chip" data-selected={addFrom === s.value} onClick={() => setAddFrom(s.value)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="field-hint">{SOURCES.find((s) => s.value === addFrom)?.hint}</p>
            {addFrom === 'withdrawal' ? <WalletPicker wallets={wallets} value={addWallet} onChange={setAddWallet} /> : null}
            <label className="field">
              <span>הערה</span>
              <input type="text" value={addNote} onChange={(e) => setAddNote(e.target.value)} />
            </label>
            <label className="field">
              <span>תאריך</span>
              <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
            </label>
            <button
              className="btn"
              type="button"
              disabled={pending || !addAmount}
              onClick={() =>
                run(
                  () => addMoneyToWallet({ walletId: addTo, amountIls: Number(addAmount), from: addFrom, note: addNote || null, date: addDate }),
                  addTo === wallet.id ? 'הכסף נוסף לארנק.' : `הכסף נוסף ל${addToName}.`,
                )
              }
            >
              להוסיף לארנק
            </button>
          </div>
        ) : null}

        {panel === 'set' ? (
          <div className="wallet-panel">
            <h3 className="picker-title">כמה כסף יש ב{wallet.name} עכשיו?</h3>
            <label className="field">
              <span>הסכום שיש בפועל</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                autoFocus
                value={target}
                onChange={(e) => setTarget(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </label>
            <p className="field-hint">
              {difference === 0 ? (
                'הסכום תואם למה שנרשם — אין מה לעדכן.'
              ) : (
                <>
                  נרשום עדכון יתרה של{' '}
                  <strong>
                    {difference > 0 ? '+' : ''}
                    <Amount value={difference} />
                  </strong>{' '}
                  כדי שהארנק יראה את הסכום הזה. ההוצאות וההכנסות שכבר נרשמו לא משתנות.
                </>
              )}
            </p>
            <button
              className="btn"
              type="button"
              disabled={pending || target === '' || difference === 0}
              onClick={() => run(() => setWalletBalance(wallet.id, Number(target)), 'הסכום בארנק עודכן.')}
            >
              עדכון הסכום
            </button>
          </div>
        ) : null}

        {panel === 'rename' ? (
          <div className="wallet-panel">
            <label className="field">
              <span>שם הארנק</span>
              <input type="text" autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            </label>
            <button
              className="btn"
              type="button"
              disabled={pending || !name.trim() || name.trim() === wallet.name}
              onClick={() => run(() => renameWallet(wallet.id, name), 'השם נשמר.')}
            >
              שמירה
            </button>
          </div>
        ) : null}

        {panel === 'delete' ? (
          <div className="wallet-panel">
            <h3 className="picker-title">להסיר את {wallet.name}?</h3>
            {deleteBlocked ? (
              <p className="field-hint">{deleteBlocked}</p>
            ) : (
              <>
                <p className="field-hint">
                  הארנק ייעלם מהרשימה. אם היו בו פעם תנועות, הן נשארות בהיסטוריה ובחישובים — שום דבר לא נמחק בשקט.
                </p>
                <button
                  className="btn btn-danger-solid"
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => deleteWallet(wallet.id), 'הארנק הוסר.', onBack ?? onClose)}
                >
                  להסיר את הארנק
                </button>
              </>
            )}
          </div>
        ) : null}

        {panel !== null ? (
          <button type="button" className="btn-ghost wallet-cancel" onClick={() => open(null)}>
            ביטול
          </button>
        ) : null}

        {error ? <p className="form-error" style={{ marginTop: 12 }}>{error}</p> : null}
      </div>
    </Sheet>
  );
}
