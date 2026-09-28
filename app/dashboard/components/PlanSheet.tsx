'use client';

import { useState, useTransition } from 'react';

import { Sheet } from '@/app/dashboard/components/Sheet';
import { Close } from '@/app/dashboard/components/icons';
import {
  createPlan,
  settlePlan,
  skipPlanMonth,
  stopPlan,
  updatePlan,
  type PlanInput,
} from '@/lib/cash/plan-actions';
import type { EnvelopeRef } from '@/lib/cash/envelopes';
import type { CashPlan, PlanKind } from '@/lib/cash/plans';
import type { WalletSummary } from '@/lib/dashboard/data';
import { monthLabel } from '@/lib/money';
import type { EnvelopeType, HouseholdMember } from '@/lib/types';

export interface PlanDraft {
  planId: string | null;
  kind: PlanKind;
  amountIls: number | null;
  category: string;
  note: string;
  envelopeId: string | null;
  dayOfMonth: number;
  recurrence: 'monthly' | 'once';
  startsMonth: string;
  endsMonth: string | null;
  walletId: string | null;
  memberId: string | null;
  /** Whether this month's occurrence is still waiting — offers "paid" and "not this month". */
  pendingThisMonth: boolean;
}

export function newPlanDraft(
  kind: PlanKind,
  month: string,
  today: string,
  memberId: string | null,
  envelopeId: string | null = null,
): PlanDraft {
  return {
    planId: null,
    kind,
    amountIls: null,
    category: '',
    note: '',
    envelopeId,
    // Inside the viewed month, default to today's day; otherwise the 1st.
    dayOfMonth: today.startsWith(month) ? Number(today.slice(8, 10)) : 1,
    recurrence: 'monthly',
    startsMonth: month,
    endsMonth: null,
    walletId: null,
    memberId,
    pendingThisMonth: false,
  };
}

/**
 * A plan as a draft. Its envelope is stored as type + name, so find this
 * month's envelope with that identity for the picker to highlight.
 */
export function planToDraft(plan: CashPlan, envelopes: EnvelopeRef[], pendingThisMonth: boolean): PlanDraft {
  const envelope =
    plan.envelope_type === 'trackingCategory'
      ? envelopes.find((e) => e.type === 'trackingCategory' && e.name === plan.envelope_name)
      : envelopes.find((e) => e.type === plan.envelope_type);
  return {
    planId: plan.id,
    kind: plan.kind,
    amountIls: Number(plan.amount_ils),
    category: plan.category,
    note: plan.note ?? '',
    envelopeId: envelope?.envelopeId ?? null,
    dayOfMonth: plan.day_of_month,
    recurrence: plan.recurrence,
    startsMonth: plan.starts_month,
    endsMonth: plan.ends_month,
    walletId: plan.wallet_id,
    memberId: plan.member_id,
    pendingThisMonth,
  };
}

/**
 * Expected cash, in the same shape as the cash entry sheet: coloured header
 * with the amount, the envelope picker, then when and from where. Editing an
 * existing plan adds this month's actions — paid, not this month, stop.
 */
export function PlanSheet({
  draft,
  month,
  envelopes,
  members,
  wallets,
  onClose,
}: {
  draft: PlanDraft;
  /** The month being viewed: where "paid" and "not this month" apply. */
  month: string;
  envelopes: EnvelopeRef[];
  members: Pick<HouseholdMember, 'id' | 'display_name'>[];
  wallets: WalletSummary[];
  onClose: () => void;
}) {
  const [form, setForm] = useState<PlanDraft>(draft);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const patch = (next: Partial<PlanDraft>) => setForm((f) => ({ ...f, ...next }));

  const chosen = envelopes.find((e) => e.envelopeId === form.envelopeId) ?? null;
  const headerType: EnvelopeType = form.kind === 'income' ? 'cashIncome' : (chosen?.type ?? 'variable');
  const isIncome = form.kind === 'income';
  const monthName = monthLabel(month).split(' ')[0] ?? month;

  const run = (task: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const result = await task();
      if (result.ok) onClose();
      else setError(result.error ?? 'משהו השתבש.');
    });

  const save = () => {
    const input: PlanInput = {
      kind: form.kind,
      amountIls: form.amountIls ?? 0,
      category: form.category.trim() || (chosen?.type === 'trackingCategory' ? chosen.name : '') || (chosen?.name ?? ''),
      note: form.note.trim() || null,
      envelopeId: isIncome ? null : form.envelopeId,
      dayOfMonth: form.dayOfMonth,
      recurrence: form.recurrence,
      startsMonth: form.startsMonth,
      endsMonth: form.endsMonth,
      walletId: form.walletId,
      memberId: form.memberId,
    };
    run(() => (form.planId ? updatePlan(form.planId, input) : createPlan(input)));
  };

  return (
    <Sheet open onClose={onClose} labelledBy="plan-sheet-label">
      <div className="envelope" data-type={headerType}>
        <div className="sheet-head" data-on-dark={headerType !== 'variable'}>
          <div className="entry-head-row">
            <p className="label" id="plan-sheet-label">
              {isIncome ? 'הכנסה צפויה במזומן' : 'הוצאה צפויה במזומן'}
              {chosen && !isIncome ? ` · ${chosen.name}` : ''}
            </p>
            <button className="entry-close" type="button" aria-label="סגירה" onClick={onClose}>
              <Close />
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
        </div>
      </div>

      <div className="sheet-body">
        {form.planId && form.pendingThisMonth ? (
          <div className="plan-now">
            <button
              className="btn"
              type="button"
              disabled={pending}
              onClick={() => run(() => settlePlan(form.planId!, month, form.amountIls ?? undefined))}
            >
              {isIncome ? `התקבל ב${monthName}` : `שולם ב${monthName}`}
            </button>
            <button className="btn-ghost" type="button" disabled={pending} onClick={() => run(() => skipPlanMonth(form.planId!, month))}>
              לא ב{monthName}
            </button>
          </div>
        ) : null}

        {!isIncome ? (
          <>
            <h3 className="picker-title">איזו הוצאה זו?</h3>
            <div className="picker">
              {envelopes.map((envelope) => (
                <button
                  key={envelope.envelopeId}
                  type="button"
                  className="picker-row"
                  data-selected={envelope.envelopeId === form.envelopeId}
                  onClick={() =>
                    patch({
                      envelopeId: envelope.envelopeId,
                      category: envelope.type === 'trackingCategory' ? envelope.name : form.category,
                    })
                  }
                >
                  <span className="picker-icon" data-type={envelope.type} aria-hidden="true">
                    {envelope.type === 'variable' ? '⟳' : envelope.type === 'fixed' ? '⌂' : '◉'}
                  </span>
                  <span className="picker-label">{envelope.name}</span>
                  <span className="picker-check" aria-hidden="true">✓</span>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {isIncome || !chosen || chosen.type !== 'trackingCategory' ? (
          <label className="field">
            <span>{isIncome ? 'מקור' : 'קטגוריה'}</span>
            <input
              type="text"
              placeholder={isIncome ? 'למשל: משכורת במזומן' : 'למשל: ניקיון'}
              value={form.category}
              onChange={(e) => patch({ category: e.target.value })}
            />
          </label>
        ) : null}

        <label className="field">
          <span>הערה</span>
          <input type="text" placeholder={isIncome ? 'למשל: שיעורים פרטיים' : 'למשל: עוזרת בית'} value={form.note} onChange={(e) => patch({ note: e.target.value })} />
        </label>

        <div className="field">
          <span>כמה פעמים</span>
          <div className="chips">
            <button type="button" className="chip" data-selected={form.recurrence === 'monthly'} onClick={() => patch({ recurrence: 'monthly' })}>
              כל חודש
            </button>
            <button type="button" className="chip" data-selected={form.recurrence === 'once'} onClick={() => patch({ recurrence: 'once', endsMonth: null })}>
              רק ב{monthLabel(form.startsMonth).split(' ')[0]}
            </button>
          </div>
        </div>

        <label className="field">
          <span>באיזה יום בחודש</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={form.dayOfMonth}
            onChange={(e) => patch({ dayOfMonth: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
          />
        </label>

        {wallets.length > 1 ? (
          <div className="field">
            <span>{isIncome ? 'לאיזה ארנק' : 'מאיזה ארנק'}</span>
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
                <button key={m.id} type="button" className="chip" data-selected={m.id === form.memberId} onClick={() => patch({ memberId: m.id })}>
                  {m.display_name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}

        <button className="btn" type="button" disabled={pending} onClick={save}>
          {pending ? '…' : 'שמירה'}
        </button>
        {form.planId ? (
          <button className="btn-ghost" type="button" disabled={pending} onClick={() => run(() => stopPlan(form.planId!, month))}>
            להפסיק מ{monthName} והלאה
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
