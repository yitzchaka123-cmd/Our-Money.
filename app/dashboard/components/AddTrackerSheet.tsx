'use client';

import { useEffect, useState } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { SmallChevronLeft } from '@/app/dashboard/components/icons-extra';
import { Popup } from '@/app/dashboard/components/Popup';
import { parseAmount, useSave } from '@/app/dashboard/components/TrackerSheets';
import {
  addCustomTracker,
  hideTracker,
  trackableCategories,
  type HiddenTracker,
  type TrackableCategory,
} from '@/lib/dashboard/tracker-actions';
import { monthParts } from '@/lib/money';

type Offer = { categories: TrackableCategory[]; hidden: HiddenTracker[] };

const TILE_COLOURS = ['#5d7afc', '#00b33c', '#ff7a30', '#f04e8c', '#ffc800', '#14b8a6', '#8b5cf6'];

function tileColour(label: string): string {
  let hash = 0;
  for (const ch of label) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_COLOURS[hash % TILE_COLOURS.length]!;
}

/** "הוספת קטגוריה למעקב" — the dashed button RiseUp puts after the trackers. */
export function AddTrackerButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="add-row add-tracker" type="button" onClick={onClick}>
      <span className="add-plus" aria-hidden="true">+</span>
      <span>הוספת קטגוריה למעקב</span>
    </button>
  );
}

/**
 * Pick one of the household's categories that is not tracked yet and give it
 * a monthly target. RiseUp's API is read-only, so the tracker is ours: it
 * collects this month's variable spending with that label.
 */
export function AddTrackerSheet({
  month,
  trackedNames,
  onClose,
  initial = null,
  initialPick = null,
}: {
  month: string;
  trackedNames: string[];
  onClose: () => void;
  /** Preview only. */
  initial?: Offer | null;
  initialPick?: TrackableCategory | null;
}) {
  const [offer, setOffer] = useState<Offer | null>(initial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pick, setPick] = useState<TrackableCategory | null>(initialPick);
  const [filter, setFilter] = useState('');
  const [text, setText] = useState('');
  const { pending, error, run } = useSave(onClose);
  const namesKey = trackedNames.join('|');

  useEffect(() => {
    if (initial) return;
    let live = true;
    trackableCategories(month, namesKey ? namesKey.split('|') : []).then((result) => {
      if (!live) return;
      if (result.ok) setOffer(result.data);
      else setLoadError(result.error);
    });
    return () => {
      live = false;
    };
  }, [month, namesKey, initial]);

  if (pick) {
    const amount = parseAmount(text);
    return (
      <Popup
        onClose={onClose}
        labelledBy="add-tracker-title"
        tone="primary"
        title={`כמה כסף צפוי לצאת על ${pick.label} בחודש?`}
      >
        <label className="amount-box">
          <input
            inputMode="decimal"
            autoFocus
            placeholder="יעד חודשי"
            value={text}
            aria-label="יעד חודשי"
            onChange={(e) => setText(e.target.value)}
          />
          <span className="cur" aria-hidden="true">₪</span>
        </label>
        {pick.spent > 0 ? (
          <p className="popup-text">
            בחודשים האחרונים יצאו על {pick.label} <Amount value={pick.spent} decimals={0} /> בסך הכול.
          </p>
        ) : null}
        <p className="ours-line">
          המעקב נשמר אצלנו בלבד — רייזאפ לא מתעדכנת. ההוצאות המשתנות שמסומנות {pick.label} יעברו לכאן מ{monthParts(month).name}, והיעד נלקח מתקציב ההוצאות המשתנות.
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn" type="button" disabled={pending || amount === null} onClick={() => run(() => addCustomTracker(pick.label, amount ?? 0))}>
          הוספה למעקב
        </button>
        <button className="popup-link" type="button" onClick={() => setPick(null)}>
          חזרה לרשימה
        </button>
      </Popup>
    );
  }

  const shown = (offer?.categories ?? []).filter((c) => !filter.trim() || c.label.includes(filter.trim()));

  return (
    <Popup onClose={onClose} labelledBy="add-tracker-title" tone="primary" title="הוספת קטגוריה למעקב">
      {loadError ? <p className="form-error">{loadError}</p> : null}
      {!offer && !loadError ? <p className="picker-empty">טוען את הקטגוריות…</p> : null}
      {offer && offer.categories.length > 8 ? (
        <input
          className="tracker-filter"
          type="search"
          placeholder="חיפוש קטגוריה"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      ) : null}
      {offer && offer.categories.length === 0 && offer.hidden.length === 0 ? (
        <p className="picker-empty">כל הקטגוריות כבר במעקב.</p>
      ) : null}
      <div className="category-list">
        {shown.map((category) => (
          <button key={category.label} type="button" className="category-row" onClick={() => setPick(category)}>
            <span className="category-tile" style={{ background: tileColour(category.label) }} aria-hidden="true">
              {category.label.slice(0, 1)}
            </span>
            <span className="category-name">{category.label}</span>
            <SmallChevronLeft />
          </button>
        ))}
      </div>
      {offer && offer.hidden.length > 0 ? (
        <>
          <h3 className="picker-title">קטגוריות שהוסרו מהתזרים כאן</h3>
          <div className="category-list">
            {offer.hidden.map((tracker) => (
              <button
                key={tracker.key}
                type="button"
                className="category-row"
                disabled={pending}
                onClick={() => run(() => hideTracker(tracker.key, false))}
              >
                <span className="category-tile" style={{ background: 'var(--tracking)' }} aria-hidden="true">
                  {tracker.name.slice(0, 1)}
                </span>
                <span className="category-name">
                  {tracker.name}
                  <span className="category-sub">להחזיר למעקב</span>
                </span>
                <SmallChevronLeft />
              </button>
            ))}
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </>
      ) : null}
    </Popup>
  );
}
