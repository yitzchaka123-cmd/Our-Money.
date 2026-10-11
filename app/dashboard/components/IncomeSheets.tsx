'use client';

import { useState } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { shortDate } from '@/app/dashboard/components/EnvelopeCard';
import { Info } from '@/app/dashboard/components/icons-extra';
import { Popup } from '@/app/dashboard/components/Popup';
import { parseAmount, useSave } from '@/app/dashboard/components/TrackerSheets';
import type { EnvelopeView } from '@/lib/dashboard/data';
import { moveCashIncomesToMonth, setExpectedIncome } from '@/lib/dashboard/tracker-actions';
import { monthLabel, monthParts } from '@/lib/money';

/**
 * The income ⋮ menu's surfaces. RiseUp's income is read-only to us: the
 * expected figure we keep is our own, for this month only, and only cash
 * incomes can be moved.
 */

/** "עדכון צפי הכנסות משתנות": how much is still expected this month. */
export function ExpectedIncomePopup({
  envelope,
  month,
  onClose,
}: {
  envelope: EnvelopeView;
  month: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(String(Math.round(envelope.expected)));
  const { pending, error, run } = useSave(onClose);
  const amount = parseAmount(text);
  const preview = Math.max(amount ?? envelope.expected, envelope.actual);
  const ratio = preview > 0 ? Math.min(envelope.actual / preview, 1) : 0;
  const ours = envelope.override?.retargeted ?? false;

  return (
    <Popup onClose={onClose} labelledBy="income-target-title" title="עדכון צפי הכנסות משתנות">
      <p className="popup-text">
        כמה כסף צפוי להיכנס ב{monthParts(month).name} <strong>בסך הכול</strong>, כולל מה שכבר נכנס?
      </p>
      <label className="amount-box">
        <input inputMode="decimal" value={text} aria-label="הכנסה צפויה" onChange={(e) => setText(e.target.value)} />
        <span className="cur" aria-hidden="true">₪</span>
      </label>

      <div className="impact-card envelope" data-type="variableIncome">
        <p className="impact-title">איך זה ישפיע על סך ההכנסות הצפויות?</p>
        <div className="envelope-figures">
          <div>
            <p className="figure-label">נכנס</p>
            <Amount value={envelope.actual} className="figure-actual" />
          </div>
          <div>
            <p className="figure-label">צפוי להיכנס</p>
            <Amount value={preview} className="figure-expected" />
          </div>
        </div>
        <div className="bar">
          <div className="bar-fill" data-nonzero={envelope.actual > 0} style={{ width: `${ratio * 100}%` }} />
        </div>
        <p className="impact-foot">
          עד עכשיו נכנסו <Amount value={envelope.actual} decimals={0} /> הכנסות משתנות
        </p>
      </div>

      <div className="tip-box">
        <Info />
        <div>
          <strong>כדאי לשים לב</strong>
          <p>
            הצפי נשמר אצלנו בלבד ורק ל{monthParts(month).name} — רייזאפ לא מתעדכנת, כי הגישה שלנו אליה היא לקריאה בלבד. בסוף
            החודש התזרים מתעדכן לפי מה שנכנס בפועל.
          </p>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      <button className="btn" type="button" disabled={pending || amount === null} onClick={() => run(() => setExpectedIncome(month, amount ?? 0))}>
        סיימתי
      </button>
      {ours ? (
        <button className="popup-link" type="button" disabled={pending} onClick={() => run(() => setExpectedIncome(month, null))}>
          חזרה לצפי של רייזאפ
        </button>
      ) : (
        <button className="popup-link" type="button" onClick={onClose}>
          ביטול
        </button>
      )}
    </Popup>
  );
}

/**
 * "העברת כמה הכנסות יחד": pick cash incomes, then the month to move them to.
 * RiseUp's own incomes are listed too, greyed, so it is clear why they stay.
 */
export function MoveIncomesPopup({
  envelopes,
  month,
  months,
  onClose,
}: {
  envelopes: EnvelopeView[];
  month: string;
  months: string[];
  onClose: () => void;
}) {
  const riseup = envelopes.filter((e) => e.type === 'variableIncome').flatMap((e) => e.actuals.filter((a) => !a.cash));
  const cash = envelopes.filter((e) => e.type === 'cashIncome').flatMap((e) => e.actuals.filter((a) => a.cash?.kind === 'income'));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'pick' | 'month'>('pick');
  const [target, setTarget] = useState<string | null>(null);
  const { pending, error, run } = useSave(onClose);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const options = [...new Set([...months, shift(month, 1), shift(month, -1)])].filter((m) => m && m !== month).sort().reverse();

  if (step === 'month') {
    return (
      <Popup onClose={onClose} labelledBy="move-incomes-title" tone="income" title="לאיזה חודש להזיז?">
        {options.map((option) => (
          <button key={option} className="radio-row" type="button" onClick={() => setTarget(option)}>
            <span>{monthLabel(option)}</span>
            <span className="radio" data-checked={option === target} />
          </button>
        ))}
        {error ? <p className="form-error">{error}</p> : null}
        <button
          className="btn"
          type="button"
          style={{ marginTop: 18 }}
          disabled={pending || !target}
          onClick={() => run(() => moveCashIncomesToMonth([...selected], target!))}
        >
          הזזה
        </button>
        <button className="popup-link" type="button" onClick={() => setStep('pick')}>
          חזרה
        </button>
      </Popup>
    );
  }

  return (
    <Popup onClose={onClose} labelledBy="move-incomes-title" tone="income" title="איזו הכנסה להזיז?">
      {cash.length === 0 ? <p className="picker-empty">אין החודש הכנסות במזומן להזיז.</p> : null}
      {cash.map((a) => (
        <label key={a.cash!.id} className="income-pick">
          <span className="income-pick-main">
            <span className="income-pick-top">
              <span>{shortDate(a.transactionDate)}</span>
              <Amount value={a.amountIls} decimals={0} />
            </span>
            <span className="income-pick-name">{a.businessName} · מזומן</span>
          </span>
          <input type="checkbox" className="round-check" checked={selected.has(a.cash!.id)} onChange={() => toggle(a.cash!.id)} />
        </label>
      ))}
      {riseup.map((a) => (
        <div key={a.transactionId} className="income-pick" aria-disabled="true">
          <span className="income-pick-main">
            <span className="income-pick-top">
              <span>{shortDate(a.transactionDate)}</span>
              <Amount value={a.amountIls} decimals={0} />
            </span>
            <span className="income-pick-name">{a.businessName}</span>
          </span>
          <input type="checkbox" className="round-check" disabled aria-label="הכנסה מרייזאפ — לא ניתנת להזזה כאן" />
        </div>
      ))}
      {riseup.length > 0 ? (
        <p className="ours-line">הכנסות מרייזאפ אפשר להזיז רק באפליקציה של רייזאפ — הגישה שלנו אליה היא לקריאה בלבד.</p>
      ) : null}
      <button className="btn" type="button" disabled={selected.size === 0} onClick={() => setStep('month')}>
        המשך
      </button>
    </Popup>
  );
}

function shift(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
