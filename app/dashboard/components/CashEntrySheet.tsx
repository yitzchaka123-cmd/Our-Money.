'use client';

import { useState, useTransition } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { Sheet } from '@/app/dashboard/components/Sheet';
import { Close } from '@/app/dashboard/components/icons';
import { addCashEntry, deleteCashEntry, updateCashEntry, type CashEntryInput, type CashKind } from '@/lib/cash/actions';
import type { EnvelopeRef } from '@/lib/cash/envelopes';
import type { WalletSummary } from '@/lib/dashboard/data';
import { isoDateInIsrael } from '@/lib/intake/parse';
import type { EnvelopeType, HouseholdMember } from '@/lib/types';

export interface CashEntryDraft {
  id: string | null;
  kind: CashKind;
  /** A withdrawal RiseUp reported: amount and date are the bank's, not ours. */
  fromBank?: boolean;
  amountIls: number | null;
  category: string;
  note: string;
  date: string;
  envelopeId: string | null;
  memberId: string | null;
  walletId: string | null;
}

export function emptyDraft(
  kind: CashKind,
  memberId: string | null,
  walletId: string | null = null,
): CashEntryDraft {
  return {
    id: null,
    kind,
    amountIls: null,
    category: '',
    note: '',
    date: isoDateInIsrael(),
    envelopeId: null,
    memberId,
    walletId,
  };
}

const INCOME_SUGGESTIONS = ['משכורת במזומן', 'מתנה', 'החזר', 'מכירה', 'אחר'];

const KIND_LABELS: Record<CashKind, string> = {
  spend: 'הוצאה',
  income: 'הכנסה',
  withdrawal: 'משיכה',
};

const HEADER_LABELS: Record<CashKind, string> = {
  spend: 'הוצאה במזומן',
  income: 'הכנסה במזומן',
  withdrawal: 'משיכת מזומן',
};

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
  wallets,
  onClose,
}: {
  open: boolean;
  draft: CashEntryDraft;
  envelopes: EnvelopeRef[];
  members: Pick<HouseholdMember, 'id' | 'display_name'>[];
  wallets: WalletSummary[];
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
  const headerType: EnvelopeType =
    form.kind === 'income' ? 'cashIncome' : form.kind === 'withdrawal' ? 'trackingCategory' : (chosen?.type ?? 'variable');
  const needsFreeCategory =
    form.kind === 'income' || (form.kind === 'spend' && (!chosen || chosen.type !== 'trackingCategory'));
  // Switching kind moves a row between tables, so it is offered only for a new entry.
  const canSwitchKind = form.id === null;
  const locked = form.fromBank === true;

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
      walletId: form.walletId,
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
              {HEADER_LABELS[form.kind]}
              {chosen && form.kind === 'spend' ? ` · ${chosen.name}` : ''}
              {locked ? ' · מהבנק' : ''}
            </p>
            <button className="entry-close" type="button" aria-label="סגירה" onClick={onClose}>
              <Close />
            </button>
          </div>

          {canSwitchKind ? (
            <div className="kind-toggle" role="tablist" aria-label="סוג">
              {(['spend', 'income', 'withdrawal'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="tab"
                  aria-selected={form.kind === kind}
                  onClick={() => patch({ kind, ...(kind === 'spend' ? {} : { envelopeId: null }) })}
                >
                  {KIND_LABELS[kind]}
                </button>
              ))}
            </div>
          ) : null}

          <label className="amount-input">
            <span className="visually-hidden">סכום</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              placeholder="0.0"
              disabled={locked}
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
          <input type="date" disabled={locked} value={form.date} onChange={(e) => patch({ date: e.target.value })} />
        </label>
        {locked ? <p className="field-hint">הסכום והתאריך מגיעים מהבנק דרך RiseUp.</p> : null}
        {form.kind === 'withdrawal' && !locked ? (
          <p className="field-hint">כשהמשיכה תופיע ב-RiseUp היא תתחבר לרישום הזה ולא תיספר פעמיים.</p>
        ) : null}

        {wallets.length > 1 ? (
          <div className="field">
            <span>{form.kind === 'spend' ? 'מאיזה ארנק' : 'לאיזה ארנק'}</span>
            <div className="chips">
              {wallets.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className="chip"
                  data-selected={(form.walletId ?? wallets.find((x) => x.isDefault)?.id) === w.id}
                  onClick={() => patch({ walletId: w.id })}
                >
                  {w.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

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
            {locked ? 'זו לא משיכה' : 'מחיקה'}
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
