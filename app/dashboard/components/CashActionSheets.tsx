'use client';

import { useState, useTransition } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { shortDate } from '@/app/dashboard/components/EnvelopeCard';
import { ChevronDown, Close } from '@/app/dashboard/components/icons';
import { Sheet } from '@/app/dashboard/components/Sheet';
import {
  moveCashEntryToMonth,
  moveCashSpendToEnvelope,
  splitCashEntry,
  updateCashNote,
  type CashKind,
} from '@/lib/cash/actions';
import type { EnvelopeRef } from '@/lib/cash/envelopes';
import { checkSplit, splitParts, type SplitRow } from '@/lib/cash/split';
import { formatAmount, monthLabel } from '@/lib/money';
import type { NormalizedActual } from '@/lib/riseup/envelopes';
import type { EnvelopeType } from '@/lib/types';

/**
 * The sub-sheets behind RiseUp's transaction actions, for cash rows: note,
 * move to another envelope, split, move to another month. Each is one
 * focused surface with a single primary button, like RiseUp's.
 */

export type CashAction = 'note' | 'move' | 'split' | 'month';

interface BaseProps {
  actual: NormalizedActual;
  kind: CashKind;
  onClose: () => void;
}

function useRun(onClose: () => void) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (task: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const result = await task();
      if (result.ok) onClose();
      else setError(result.error ?? 'משהו השתבש.');
    });
  return { pending, error, run };
}

function Head({ actual, title }: { actual: NormalizedActual; title: string }) {
  return (
    <div className="sheet-body">
      <h2 className="sheet-title" id="cash-action-title">
        {title}
      </h2>
      <p className="action-context">
        <Amount value={actual.amountIls} /> · {actual.businessName}
      </p>
    </div>
  );
}

export function NoteSheet({ actual, kind, onClose }: BaseProps) {
  const [note, setNote] = useState(actual.businessName === actual.categoryLabel ? '' : actual.businessName);
  const { pending, error, run } = useRun(onClose);
  return (
    <Sheet open onClose={onClose} labelledBy="cash-action-title">
      <Head actual={actual} title="להוסיף הערה" />
      <div className="sheet-body">
        <label className="field">
          <span>הערה</span>
          <input type="text" value={note} autoFocus onChange={(e) => setNote(e.target.value)} placeholder="הערה" />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn" type="button" disabled={pending} onClick={() => run(() => updateCashNote(actual.cash!.id, kind, note))}>
          שמירה
        </button>
      </div>
    </Sheet>
  );
}

export function MoveEnvelopeSheet({
  actual,
  envelopes,
  currentEnvelopeId,
  onClose,
}: BaseProps & { envelopes: EnvelopeRef[]; currentEnvelopeId: string | null }) {
  const [selected, setSelected] = useState<string | null>(currentEnvelopeId);
  const { pending, error, run } = useRun(onClose);
  return (
    <Sheet open onClose={onClose} labelledBy="cash-action-title">
      <Head actual={actual} title="איזו הוצאה זו?" />
      <div className="sheet-body">
        <div className="picker">
          {envelopes.map((envelope) => (
            <button
              key={envelope.envelopeId}
              type="button"
              className="picker-row"
              data-selected={envelope.envelopeId === selected}
              onClick={() => setSelected(envelope.envelopeId)}
            >
              <span className="picker-icon" data-type={envelope.type} aria-hidden="true">
                {envelope.type === 'variable' ? '⟳' : envelope.type === 'fixed' ? '⌂' : '◉'}
              </span>
              <span className="picker-label">{envelope.name}</span>
              <span className="picker-check" aria-hidden="true">✓</span>
            </button>
          ))}
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <button
          className="btn"
          type="button"
          disabled={pending || !selected || selected === currentEnvelopeId}
          onClick={() => run(() => moveCashSpendToEnvelope(actual.cash!.id, selected!))}
        >
          שמירה
        </button>
      </div>
    </Sheet>
  );
}

/**
 * RiseUp's "איך לפצל את ההוצאה?": the original on top in the envelope's
 * colour, then the parts you take out (amount and where it goes), "לפצל
 * לעוד הוצאה" for another, and "מה שנשאר" — filled in by itself and not
 * editable. Saving is off until the parts add up with something left over.
 */
export function SplitSheet({
  actual,
  kind,
  envelopes,
  envelopeType = 'variable',
  envelopeTitle = '',
  currentEnvelopeId = null,
  initialRows,
  onClose,
}: BaseProps & {
  envelopes: EnvelopeRef[];
  envelopeType?: EnvelopeType;
  envelopeTitle?: string;
  currentEnvelopeId?: string | null;
  /** Preview only: parts already typed. */
  initialRows?: SplitRow[];
}) {
  const total = actual.amountIls;
  const original = actual.categoryLabel ?? '';
  const originalNote = actual.businessName === actual.categoryLabel ? null : actual.businessName || null;
  const spend = kind === 'spend';
  const [rows, setRows] = useState<SplitRow[]>(
    initialRows ?? [{ amountText: '', envelopeId: currentEnvelopeId, category: original }],
  );
  const [rest, setRest] = useState({ envelopeId: currentEnvelopeId, category: original, note: originalNote ?? '' });
  const { pending, error, run } = useRun(onClose);
  const check = checkSplit(total, rows);
  const touched = rows.some((r) => r.amountText.trim() !== '');

  const patch = (i: number, next: Partial<SplitRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...next } : r)));
  const pick = (envelopeId: string, category: string) => {
    const env = envelopes.find((e) => e.envelopeId === envelopeId) ?? null;
    // A tracker IS its category; the big envelopes keep the label it had.
    return { envelopeId: env?.envelopeId ?? null, category: env?.type === 'trackingCategory' ? env.name : category || original };
  };
  const typeOf = (envelopeId: string | null) => envelopes.find((e) => e.envelopeId === envelopeId)?.type ?? envelopeType;
  const word = spend ? 'הוצאה' : 'הכנסה';

  const where = (value: { envelopeId: string | null; category: string }, onChange: (v: { envelopeId: string | null; category: string }) => void) =>
    spend && envelopes.length > 0 ? (
      <label className="split-field">
        <span>קטגוריה</span>
        <span className="split-picker">
          <span className="picker-icon" data-type={typeOf(value.envelopeId)} aria-hidden="true">
            {typeOf(value.envelopeId) === 'variable' ? '⟳' : typeOf(value.envelopeId) === 'fixed' ? '⌂' : '◉'}
          </span>
          <select value={value.envelopeId ?? ''} onChange={(e) => onChange(pick(e.target.value, value.category))}>
            {value.envelopeId ? null : <option value="">לפי הקטגוריה ({value.category || 'משתנה'})</option>}
            {envelopes.map((env) => (
              <option key={env.envelopeId} value={env.envelopeId}>
                {env.type === 'variable' ? 'משתנה' : env.name}
              </option>
            ))}
          </select>
          <ChevronDown size={20} />
        </span>
      </label>
    ) : (
      <label className="split-field">
        <span>קטגוריה</span>
        <input type="text" className="split-input" value={value.category} onChange={(e) => onChange({ ...value, category: e.target.value })} />
      </label>
    );

  return (
    <Sheet open onClose={onClose} labelledBy="split-title">
      <div className="envelope" data-type={envelopeType}>
        <div className="sheet-head split-head" data-on-dark={envelopeType !== 'variable'}>
          <button className="popup-close" type="button" aria-label="סגירה" onClick={onClose}>
            <Close size={22} />
          </button>
          <p className="label">{envelopeType === 'variable' ? 'משתנה' : envelopeTitle || (spend ? 'הוצאה' : 'הכנסה')}</p>
          <Amount value={total} className="figure" />
          <p className="meta">{actual.businessName}</p>
          {actual.cash?.memberName ? <p className="meta">מזומן · {actual.cash.memberName}</p> : <p className="meta">מזומן</p>}
          <p className="meta">{shortDate(actual.transactionDate)}</p>
          <h2 className="split-title" id="split-title">
            איך לפצל את ה{word}?
          </h2>
        </div>
      </div>

      <div className="sheet-body split-body">
        {rows.map((row, i) => (
          <section key={i} className="split-section">
            <div className="split-section-head">
              <h3>
                {word} {i + 1}
              </h3>
              {rows.length > 1 ? (
                <button className="link-btn" type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                  להסיר
                </button>
              ) : null}
            </div>
            <label className="amount-box split-amount">
              <input
                inputMode="decimal"
                placeholder={`סכום ה${word}`}
                aria-label={`סכום ה${word} ${i + 1}`}
                value={row.amountText}
                onChange={(e) => patch(i, { amountText: e.target.value })}
              />
              <span className="cur" aria-hidden="true">₪</span>
            </label>
            {where(row, (v) => patch(i, v))}
          </section>
        ))}

        <button
          className="split-more"
          type="button"
          onClick={() => setRows((rs) => [...rs, { amountText: '', envelopeId: currentEnvelopeId, category: original }])}
        >
          <span className="add-plus" aria-hidden="true">+</span>
          <span>לפצל לעוד {word}</span>
        </button>

        <section className="split-section split-rest">
          <h3>מה שנשאר</h3>
          <label className="split-field">
            <span>סכום ה{word}</span>
            <span className="amount-box">
              <input readOnly disabled value={formatAmount(check.remainder).replace(' ₪', '')} aria-label="מה שנשאר" />
              <span className="cur" aria-hidden="true">₪</span>
            </span>
          </label>
          <p className="field-hint">אי אפשר לערוך את מה שנשאר — הוא מתעדכן לבד.</p>
          {where(rest, (v) => setRest((r) => ({ ...r, ...v })))}
          <label className="split-field">
            <span className="visually-hidden">הערה</span>
            <input
              type="text"
              className="split-input"
              placeholder="הערה"
              value={rest.note}
              onChange={(e) => setRest((r) => ({ ...r, note: e.target.value }))}
            />
          </label>
        </section>

        {touched && check.problem ? <p className="form-error">{check.problem}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <button
          className="btn"
          type="button"
          disabled={pending || !check.ok}
          onClick={() =>
            run(() =>
              splitCashEntry(
                actual.cash!.id,
                kind,
                splitParts(total, rows, { envelopeId: rest.envelopeId, category: rest.category, note: rest.note.trim() || null }, originalNote),
              ),
            )
          }
        >
          פיצול
        </button>
      </div>
    </Sheet>
  );
}

export function MoveMonthSheet({ actual, kind, months, onClose }: BaseProps & { months: string[] }) {
  const current = (actual.transactionDate ?? '').slice(0, 7);
  const [selected, setSelected] = useState(current);
  const { pending, error, run } = useRun(onClose);
  // Offer the neighbouring months even when nothing is mirrored for them yet.
  const options = [...new Set([...months, shift(current, 1), current, shift(current, -1)])]
    .filter(Boolean)
    .sort()
    .reverse();

  return (
    <Sheet open onClose={onClose} labelledBy="cash-action-title">
      <Head actual={actual} title="להזיז את העסקה לחודש אחר" />
      <div className="sheet-body">
        {options.map((month) => (
          <button key={month} className="radio-row" type="button" onClick={() => setSelected(month)}>
            <span>{monthLabel(month)}</span>
            <span className="radio" data-checked={month === selected} />
          </button>
        ))}
        {error ? <p className="form-error">{error}</p> : null}
        <button
          className="btn"
          type="button"
          style={{ marginTop: 18 }}
          disabled={pending || selected === current}
          onClick={() => run(() => moveCashEntryToMonth(actual.cash!.id, kind, selected))}
        >
          הזזה
        </button>
      </div>
    </Sheet>
  );
}

function shift(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
