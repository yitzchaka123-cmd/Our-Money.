'use client';

import { useEffect, useState, useTransition } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { Popup } from '@/app/dashboard/components/Popup';
import { barsFrom, MonthBars, TrackerHistorySheet } from '@/app/dashboard/components/TrackerHistorySheet';
import { envelopeHistory, type HistoryPoint } from '@/lib/dashboard/actions';
import type { EnvelopeView } from '@/lib/dashboard/data';
import { hideTracker, renameTracker, setTrackerTarget, type TrackerResult } from '@/lib/dashboard/tracker-actions';
import { isCustomKey } from '@/lib/dashboard/trackers';
import { monthParts } from '@/lib/money';

/**
 * The tracker ⋮ menu's surfaces, as RiseUp has them: the history popup,
 * "עריכת סכום", "עריכת שם" and "מחיקה מהתזרים". RiseUp's API is read-only,
 * so every change here is our own override, and each popup says so in one
 * line.
 */

export type TrackerSheetKind = 'tracker-history' | 'edit-target' | 'rename' | 'hide';

export const READ_ONLY_LINE = 'השינוי נשמר אצלנו בלבד — רייזאפ לא מתעדכנת, כי הגישה שלנו אליה היא לקריאה בלבד.';

export function useSave(onDone: () => void) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (task: () => Promise<TrackerResult>) =>
    start(async () => {
      setError(null);
      const result = await task();
      if (result.ok) onDone();
      else setError(result.error);
    });
  return { pending, error, run };
}

export function TrackerSheets({
  kind,
  envelope,
  month,
  onSwitch,
  onClose,
}: {
  kind: TrackerSheetKind;
  envelope: EnvelopeView;
  month: string;
  onSwitch: (kind: TrackerSheetKind) => void;
  onClose: () => void;
}) {
  if (kind === 'tracker-history') {
    return <TrackerHistorySheet envelope={envelope} month={month} onClose={onClose} onEditTarget={() => onSwitch('edit-target')} />;
  }
  if (kind === 'edit-target') return <EditTargetPopup envelope={envelope} month={month} onClose={onClose} />;
  if (kind === 'rename') return <RenamePopup envelope={envelope} onClose={onClose} />;
  return <HidePopup envelope={envelope} onClose={onClose} />;
}

/** Parse what was typed into a shekel amount; null when it is not one. */
export function parseAmount(text: string): number | null {
  const clean = text.replace(/[,\s₪]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Number(clean);
}

/** "כמה כסף צפוי לצאת על רכב באוקטובר?" — RiseUp's automatic target, or ours. */
export function EditTargetPopup({
  envelope,
  month,
  onClose,
  initialPoints = null,
}: {
  envelope: EnvelopeView;
  month: string;
  onClose: () => void;
  initialPoints?: HistoryPoint[] | null;
}) {
  const key = envelope.trackerKey ?? envelope.envelopeId ?? envelope.key;
  const custom = isCustomKey(key);
  const riseupTarget = envelope.override?.riseupTarget ?? envelope.expected;
  const [choice, setChoice] = useState<'auto' | 'mine'>('mine');
  const [text, setText] = useState(String(Math.round(envelope.expected)));
  const [onlyThisMonth, setOnlyThisMonth] = useState(envelope.override?.monthOnly ?? false);
  const [points, setPoints] = useState<HistoryPoint[] | null>(initialPoints);
  const { pending, error, run } = useSave(onClose);
  const monthName = monthParts(month).name;
  const amount = parseAmount(text);

  useEffect(() => {
    if (initialPoints || custom) return;
    let live = true;
    envelopeHistory(month, envelope.type, envelope.title, 5, envelope.trackerKey ?? null, envelope.title).then((r) => {
      if (live && r.ok) setPoints(r.data);
    });
    return () => {
      live = false;
    };
  }, [month, envelope.type, envelope.title, envelope.trackerKey, custom, initialPoints]);

  const save = () =>
    run(() =>
      choice === 'auto'
        ? setTrackerTarget(key, null, month, false)
        : setTrackerTarget(key, amount ?? 0, month, onlyThisMonth),
    );

  return (
    <Popup onClose={onClose} labelledBy="edit-target-title" title={`כמה כסף צפוי לצאת על ${envelope.title} ב${monthName}?`}>
      {!custom && riseupTarget !== null ? (
        <button
          type="button"
          className="option-card"
          data-selected={choice === 'auto'}
          onClick={() => setChoice('auto')}
        >
          <span className="option-head">
            <span className="radio" data-checked={choice === 'auto'} />
            <span>הצפי של רייזאפ</span>
          </span>
          <Amount value={riseupTarget} decimals={0} className="option-figure" />
          {points ? <MonthBars bars={barsFrom(points, { ...envelope, expected: riseupTarget }, month)} tone="tracking" /> : null}
        </button>
      ) : null}

      <div className="option-card" data-selected={choice === 'mine'} onClick={() => setChoice('mine')}>
        <span className="option-head">
          <span className="radio" data-checked={choice === 'mine'} />
          <span>צפי שלי</span>
        </span>
        <label className="amount-box">
          <input
            inputMode="decimal"
            value={text}
            aria-label="הצפי שלי"
            onFocus={() => setChoice('mine')}
            onChange={(e) => setText(e.target.value)}
          />
          <span className="cur" aria-hidden="true">₪</span>
        </label>
        <p className="option-remaining">
          נשאר להוציא <Amount value={Math.max((amount ?? 0) - envelope.actual, 0)} />
        </p>
        <label className="check-line">
          <input type="checkbox" checked={onlyThisMonth} onChange={(e) => setOnlyThisMonth(e.target.checked)} />
          <span>שמור את הצפי הזה רק ל{monthName}</span>
        </label>
      </div>

      <p className="ours-line">{READ_ONLY_LINE}</p>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="btn" type="button" disabled={pending || (choice === 'mine' && amount === null)} onClick={save}>
        עדכון
      </button>
    </Popup>
  );
}

/** "עריכת שם" — kept on our side; RiseUp's own name stays one tap away. */
export function RenamePopup({ envelope, onClose }: { envelope: EnvelopeView; onClose: () => void }) {
  const key = envelope.trackerKey ?? envelope.envelopeId ?? envelope.key;
  const [name, setName] = useState(envelope.title);
  const { pending, error, run } = useSave(onClose);
  const original = envelope.override?.custom ? envelope.override.categoryLabel : envelope.override?.riseupName;
  const clean = name.trim();

  return (
    <Popup onClose={onClose} labelledBy="rename-title" title="איך לקרוא לקטגוריה?">
      <label className="field">
        <span>שם</span>
        <input type="text" value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="ours-line">{READ_ONLY_LINE}</p>
      {error ? <p className="form-error">{error}</p> : null}
      <button
        className="btn"
        type="button"
        disabled={pending || clean.length === 0 || clean === envelope.title}
        onClick={() => run(() => renameTracker(key, clean))}
      >
        שמירה
      </button>
      {envelope.override?.renamed && original ? (
        <button className="popup-link" type="button" disabled={pending} onClick={() => run(() => renameTracker(key, null))}>
          חזרה לשם {original}
        </button>
      ) : null}
    </Popup>
  );
}

/** "מחיקה מהתזרים": hidden here; the spending goes back to variable expenses. */
export function HidePopup({ envelope, onClose }: { envelope: EnvelopeView; onClose: () => void }) {
  const key = envelope.trackerKey ?? envelope.envelopeId ?? envelope.key;
  const { pending, error, run } = useSave(onClose);
  const custom = envelope.override?.custom ?? false;

  return (
    <Popup onClose={onClose} labelledBy="hide-title" title={`להפסיק לעקוב אחרי ${envelope.title}?`}>
      <p className="popup-text">
        הקטגוריה תרד מהתזרים כאן. ההוצאות שלה יחזרו להוצאות המשתנות, יחד עם התקציב שלה, כך שהתחזית לא משתנה.
      </p>
      <p className="popup-text">
        {custom
          ? 'אפשר להוסיף אותה שוב בכל רגע דרך "הוספת קטגוריה למעקב".'
          : 'ברייזאפ עצמה הקטגוריה נשארת — רייזאפ לא מתעדכנת, כי הגישה שלנו אליה היא לקריאה בלבד. אפשר להחזיר אותה דרך "הוספת קטגוריה למעקב".'}
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="btn btn-alert" type="button" disabled={pending} onClick={() => run(() => hideTracker(key, true))}>
        להפסיק לעקוב
      </button>
      <button className="popup-link" type="button" onClick={onClose}>
        ביטול
      </button>
    </Popup>
  );
}
