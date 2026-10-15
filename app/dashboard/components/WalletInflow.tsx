'use client';

import { useState, useTransition } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { shortMonth } from '@/app/dashboard/components/TrackerHistorySheet';
import { Popup } from '@/app/dashboard/components/Popup';
import type { InflowForecast } from '@/lib/cash/inflow';
import { setCashInflowOverride } from '@/lib/cash/wallet-actions';
import { monthParts } from '@/lib/money';

/** Where the expected figure comes from, in a few words. */
export function inflowSource(inflow: InflowForecast): string {
  if (inflow.override !== null) return 'עדכנתם את הצפי לחודש הזה';
  if (inflow.basis.length === 3) return 'לפי ממוצע 3 החודשים האחרונים';
  if (inflow.basis.length > 0) return `לפי ממוצע ${inflow.basis.length === 1 ? 'החודש הקודם' : `${inflow.basis.length} החודשים האחרונים`}`;
  return 'עוד אין היסטוריה — אפשר לעדכן ידנית';
}

/**
 * "צפוי להיכנס החודש" on the wallet card: like RiseUp's income card, the
 * expected figure with how much already came in under it. Tapping it opens
 * the editor.
 */
export function WalletInflowLine({ inflow, onEdit }: { inflow: InflowForecast; onEdit?: () => void }) {
  const share = inflow.expected > 0 ? Math.min(inflow.arrived / inflow.expected, 1) : inflow.arrived > 0 ? 1 : 0;
  return (
    <button type="button" className="wallet-inflow" onClick={onEdit} aria-label="עדכון כמה צפוי להיכנס">
      <span className="wallet-inflow-row">
        <span className="wallet-inflow-label">צפוי להיכנס החודש</span>
        <Amount value={inflow.expected} decimals={0} className="wallet-inflow-figure" />
      </span>
      <span className="wallet-inflow-bar" aria-hidden="true">
        <span style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
      <span className="wallet-inflow-note">
        נכנס עד עכשיו <Amount value={inflow.arrived} decimals={0} /> · {inflowSource(inflow)}
      </span>
    </button>
  );
}

/** "עדכון כמה צפוי להיכנס": set this month's figure, or go back to the guess. */
export function WalletInflowSheet({ inflow, onClose }: { inflow: InflowForecast; onClose: () => void }) {
  const [amount, setAmount] = useState<number | ''>(inflow.expected);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const monthName = monthParts(inflow.month).name;

  const save = (value: number | null) =>
    start(async () => {
      setError(null);
      const result = await setCashInflowOverride(inflow.month, value);
      if (result.ok) onClose();
      else setError(result.error);
    });

  return (
    <Popup
      onClose={onClose}
      labelledBy="inflow-title"
      title={`כמה מזומן צפוי להיכנס ב${monthName}?`}
      footer={
        <button className="popup-link" type="button" onClick={onClose}>
          ביטול
        </button>
      }
    >
      <p className="inflow-explain">
        {inflow.basis.length > 0 ? (
          <>
            לפי משיכות והכנסות במזומן ב
            {inflow.basis.map(shortMonth).join(', ')} חישבנו{' '}
            <strong>
              <Amount value={inflow.predicted} decimals={0} />
            </strong>
            . אם ידוע לכם על סכום אחר — למשל משכורת במזומן שתגיע או משיכה גדולה — עדכנו כאן.
          </>
        ) : (
          'עוד אין מספיק היסטוריה לחשב צפי. אפשר לכתוב כמה מזומן אתם מצפים שייכנס החודש.'
        )}
      </p>
      <label className="field">
        <span>צפוי להיכנס ב{monthName}</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="1"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
        />
      </label>
      <p className="ours-line">הצפי נשמר אצלנו בלבד, לחודש הזה בלבד.</p>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="btn" type="button" disabled={pending || amount === ''} onClick={() => save(Number(amount))}>
        שמירה
      </button>
      {inflow.override !== null ? (
        <button className="btn-ghost" type="button" disabled={pending} onClick={() => save(null)}>
          לחזור לחישוב האוטומטי (<Amount value={inflow.predicted} decimals={0} />)
        </button>
      ) : null}
    </Popup>
  );
}
