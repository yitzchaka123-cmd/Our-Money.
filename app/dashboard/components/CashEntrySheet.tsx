'use client';

import { useState, useTransition } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { Sheet } from '@/app/dashboard/components/Sheet';
import { Close } from '@/app/dashboard/components/icons';
import { addCashEntry, deleteCashEntry, updateCashEntry, type CashEntryInput } from '@/lib/cash/actions';
import type { EnvelopeRef } from '@/lib/cash/envelopes';
import { isoDateInIsrael } from '@/lib/intake/parse';
import type { EnvelopeType, HouseholdMember } from '@/lib/types';

export interface CashEntryDraft {
  id: string | null;
  kind: 'spend' | 'income';
  amountIls: number | null;
  category: string;
  note: string;
  date: string;
  envelopeId: string | null;
  memberId: string | null;
}

export function emptyDraft(kind: 'spend' | 'income', memberId: string | null): CashEntryDraft {
  return {
    id: null,
    kind,
    amountIls: null,
    category: '',
    note: '',
    date: isoDateInIsrael(),
    envelopeId: null,
    memberId,
  };
}

const INCOME_SUGGESTIONS = ['משכורת במזומן', 'מתנה', 'החזר', 'מכירה', 'אחר'];

/**
 * RiseUp's "איזו הוצאה זו?" sheet, repurposed for entering cash: a coloured
 * header with the amount, the envelope picker with its coloured tiles, then
 * note, date and who, and a single primary button.
 */
export function CashEntrySheet({
  open,
  draft,
  envelopes,
  members,
  onClose,
}: {
  open: boolean;
  draft: CashEntryDraft;
  envelopes: EnvelopeRef[];
  members: Pick<HouseholdMember, 'id' | 'display_name'>[];
  onClose: () => void;
}) {
  const [form, setForm] = useState<CashEntryDraft>(draft);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // A fresh draft each time the sheet opens for a different entry.
  const [seenDraft, setSeenDraft] = useState(draft);
  if (seenDraft !== draft) {
    setSeenDraft(draft);
    setForm(draft);
    setError(null);
  }

  const chosen = envelopes.find((e) => e.envelopeId === form.envelopeId) ?? null;
  const headerType: EnvelopeType = form.kind === 'income' ? 'cashIncome' : (chosen?.type ?? 'variable');
  const needsFreeCategory = form.kind === 'income' || !chosen || chosen.type !== 'trackingCategory';

  const patch = (next: Partial<CashEntryDraft>) => setForm((f) => ({ ...f, ...next }));

  const choose = (envelope: EnvelopeRef) =>
    patch({
      envelopeId: envelope.envelopeId,
      // A tracker IS the category; the big envelopes need a label inside them.
      category: envelope.type === 'trackingCategory' ? envelope.name : form.category,
    });

  const submit = () => {
    const input: CashEntryInput = {
      kind: form.kind,
      amountIls: form.amountIls ?? 0,
      category: form.category.trim() || (chosen?.name ?? ''),
      note: form.note.trim() || null,
      date: form.date,
      envelopeId: form.kind === 'spend' ? form.envelopeId : null,
      memberId: form.memberId,
    };
    start(async () => {
      const result = form.id ? await updateCashEntry(form.id, input) : await addCashEntry(input);
      if (result.ok) onClose();
      else setError(result.error);
    });
  };

  const remove = () => {
    if (!form.id) return;
    start(async () => {
      const result = await deleteCashEntry(form.id!, form.kind);
      if (result.ok) onClose();
      else setError(result.error);
    });
  };

  return (
    <Sheet open={open} onClose={onClose} labelledBy="cash-entry-label">
      <div className="envelope" data-type={headerType}>
        <div className="sheet-head" data-on-dark={headerType !== 'variable'}>
          <div className="entry-head-row">
            <p className="label" id="cash-entry-label">
              {form.kind === 'income' ? 'הכנסה במזומן' : 'הוצאה במזומן'}
              {chosen && form.kind === 'spend' ? ` · ${chosen.name}` : ''}
            </p>
            <button className="entry-close" type="button" aria-label="סגירה" onClick={onClose}>
              <Close />
            </button>
          </div>

          <div className="kind-toggle" role="tablist" aria-label="סוג">
            <button
              type="button"
              role="tab"
              aria-selected={form.kind === 'spend'}
              onClick={() => patch({ kind: 'spend' })}
            >
              הוצאה
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={form.kind === 'income'}
              onClick={() => patch({ kind: 'income', envelopeId: null })}
            >
              הכנסה
            </button>
          </div>

          <label className="amount-input">
            <span className="visually-hidden">סכום</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              placeholder="0.0"
              value={form.amountIls ?? ''}
              onChange={(e) => patch({ amountIls: e.target.value === '' ? null : Number(e.target.value) })}
            />
            <span className="cur">₪</span>
          </label>
          {form.amountIls ? (
            <p className="meta" style={{ opacity: 0.8 }}>
              <Amount value={form.amountIls} />
            </p>
          ) : null}
        </div>
      </div>

      <div className="sheet-body">
        {form.kind === 'spend' ? (
          <>
            <h3 className="picker-title">איזו הוצאה זו?</h3>
            <div className="picker">
              {envelopes.map((envelope) => (
                <button
                  key={envelope.envelopeId}
                  type="button"
                  className="picker-row"
                  data-selected={envelope.envelopeId === form.envelopeId}
                  onClick={() => choose(envelope)}
                >
                  <span className="picker-icon" data-type={envelope.type} aria-hidden="true">
                    {envelope.type === 'variable' ? '⟳' : envelope.type === 'fixed' ? '⌂' : '◉'}
                  </span>
                  <span className="picker-label">{envelope.name}</span>
                  <span className="picker-check" aria-hidden="true">
                    ✓
                  </span>
                </button>
              ))}
              {envelopes.length === 0 ? (
                <p className="picker-empty">
                  עוד לא סונכרנו מעטפות מרייזאפ החודש. ההוצאה תירשם כהוצאה משתנה.
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        {needsFreeCategory ? (
          <label className="field">
            <span>קטגוריה</span>
            <input
              type="text"
              list={form.kind === 'income' ? 'cash-income-suggestions' : undefined}
              placeholder={form.kind === 'income' ? 'למשל: משכורת במזומן' : 'למשל: מתנות'}
              value={form.category}
              onChange={(e) => patch({ category: e.target.value })}
            />
            {form.kind === 'income' ? (
              <datalist id="cash-income-suggestions">
                {INCOME_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            ) : null}
          </label>
        ) : null}

        <label className="field">
          <span>הערה</span>
          <input
            type="text"
            placeholder="הערה"
            value={form.note}
            onChange={(e) => patch({ note: e.target.value })}
          />
        </label>

        <label className="field">
          <span>תאריך</span>
          <input type="date" value={form.date} onChange={(e) => patch({ date: e.target.value })} />
        </label>

        {members.length > 1 ? (
          <div className="field">
            <span>מי</span>
            <div className="chips">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="chip"
                  data-selected={m.id === form.memberId}
                  onClick={() => patch({ memberId: m.id })}
                >
                  {m.display_name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}

        <button className="btn" type="button" disabled={pending} onClick={submit}>
          {pending ? '…' : 'שמירה'}
        </button>
        {form.id ? (
          <button className="btn-ghost" type="button" disabled={pending} onClick={remove}>
            מחיקה
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
