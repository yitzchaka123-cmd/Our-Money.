'use client';

import { useState, useTransition } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { Sheet } from '@/app/dashboard/components/Sheet';
import {
  moveCashEntryToMonth,
  moveCashSpendToEnvelope,
  splitCashEntry,
  updateCashNote,
  type CashKind,
  type SplitPart,
} from '@/lib/cash/actions';
import type { EnvelopeRef } from '@/lib/cash/envelopes';
import { monthLabel } from '@/lib/money';
import type { NormalizedActual } from '@/lib/riseup/envelopes';

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

export function SplitSheet({ actual, kind, envelopes, onClose }: BaseProps & { envelopes: EnvelopeRef[] }) {
  const total = actual.amountIls;
  const [parts, setParts] = useState<SplitPart[]>([
    { amountIls: Math.round((total / 2) * 10) / 10, category: actual.categoryLabel ?? '', envelopeId: null, note: null },
    { amountIls: Math.round((total - Math.round((total / 2) * 10) / 10) * 10) / 10, category: actual.categoryLabel ?? '', envelopeId: null, note: null },
  ]);
  const { pending, error, run } = useRun(onClose);

  const sum = Math.round(parts.reduce((s, p) => s + (Number(p.amountIls) || 0), 0) * 100) / 100;
  const remainder = Math.round((total - sum) * 100) / 100;
  const patch = (i: number, next: Partial<SplitPart>) =>
    setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...next } : p)));

  return (
    <Sheet open onClose={onClose} labelledBy="cash-action-title">
      <Head actual={actual} title={kind === 'income' ? 'לפצל את ההכנסה' : 'לפצל את ההוצאה'} />
      <div className="sheet-body">
        {parts.map((part, i) => (
          <div className="split-part" key={i}>
            <label className="field split-amount">
              <span>סכום</span>
              <input
                type="number" inputMode="decimal" min="0" step="0.1"
                value={part.amountIls}
                onChange={(e) => patch(i, { amountIls: Number(e.target.value) })}
              />
            </label>
            {kind === 'spend' && envelopes.length > 0 ? (
              <label className="field">
                <span>מעטפה</span>
                <select
                  value={part.envelopeId ?? ''}
                  onChange={(e) => {
                    const env = envelopes.find((x) => x.envelopeId === e.target.value) ?? null;
                    patch(i, {
                      envelopeId: env?.envelopeId ?? null,
                      category: env?.type === 'trackingCategory' ? env.name : part.category,
                    });
                  }}
                >
                  <option value="">לפי הקטגוריה</option>
                  {envelopes.map((env) => (
                    <option key={env.envelopeId} value={env.envelopeId}>{env.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="field">
              <span>קטגוריה</span>
              <input type="text" value={part.category} onChange={(e) => patch(i, { category: e.target.value })} />
            </label>
            {parts.length > 2 ? (
              <button className="btn-ghost split-remove" type="button" onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))}>
                להסיר חלק
              </button>
            ) : null}
          </div>
        ))}

        <button
          className="add-row add-row--inline"
          type="button"
          onClick={() => setParts((ps) => [...ps, { amountIls: Math.max(remainder, 0), category: actual.categoryLabel ?? '', envelopeId: null, note: null }])}
        >
          <span className="add-plus" aria-hidden="true">+</span>
          <span>עוד חלק</span>
        </button>

        <p className={remainder === 0 ? 'split-total ok' : 'split-total'}>
          {remainder === 0 ? 'החלקים מסתכמים בדיוק לסכום המקורי ✓' : (
            <>
              נשאר לחלק: <Amount value={remainder} /> מתוך <Amount value={total} />
            </>
          )}
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <button
          className="btn"
          type="button"
          disabled={pending || remainder !== 0}
          onClick={() => run(() => splitCashEntry(actual.cash!.id, kind, parts))}
        >
          לפצל
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
