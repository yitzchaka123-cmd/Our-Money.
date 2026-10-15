'use client';

import { useState, useTransition } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { Sheet } from '@/app/dashboard/components/Sheet';
import { saveTransactionNote } from '@/lib/dashboard/note-actions';
import { NOTE_MAX } from '@/lib/dashboard/notes';
import type { NormalizedActual } from '@/lib/riseup/envelopes';

/**
 * "להוסיף הערה" on a RiseUp charge (feedback video 2, item 16): "דל פסטו"
 * was the schnitzel. RiseUp's API is read-only, so the note is kept on our
 * side and the sheet says so. Saving an empty note removes it.
 */
export function RiseupNoteSheet({
  actual,
  month,
  onClose,
}: {
  actual: NormalizedActual;
  /** The cashflow month the charge was opened in. */
  month: string;
  onClose: () => void;
}) {
  const [note, setNote] = useState(actual.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const had = Boolean(actual.note);

  const save = (value: string) =>
    start(async () => {
      setError(null);
      const result = await saveTransactionNote(actual.transactionId, month, value);
      if (result.ok) onClose();
      else setError(result.error);
    });

  return (
    <Sheet open onClose={onClose} labelledBy="riseup-note-title">
      <div className="sheet-body">
        <h2 className="sheet-title" id="riseup-note-title">
          {had ? 'לערוך את ההערה' : 'להוסיף הערה'}
        </h2>
        <p className="action-context">
          <Amount value={actual.amountIls} /> · {actual.businessName}
        </p>
        <label className="field">
          <span>מה זה היה?</span>
          <input
            type="text"
            value={note}
            maxLength={NOTE_MAX}
            autoFocus
            placeholder="למשל: שניצל לארוחת ערב"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <p className="field-hint">ההערה נשמרת אצלנו בלבד ומופיעה מתחת לשם העסק ובחיפוש. רייזאפ לא משתנה.</p>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn" type="button" disabled={pending} onClick={() => save(note)}>
          שמירה
        </button>
        {had ? (
          <button className="btn-ghost" type="button" disabled={pending} onClick={() => save('')} style={{ width: '100%', marginTop: 8 }}>
            מחיקת ההערה
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
