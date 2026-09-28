'use client';

import { useEffect, useState, useTransition } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { shortDate } from '@/app/dashboard/components/EnvelopeCard';
import { Sheet } from '@/app/dashboard/components/Sheet';
import { moveCashSpendsToEnvelope } from '@/lib/cash/actions';
import type { EnvelopeRef } from '@/lib/cash/envelopes';
import type { CashPlan } from '@/lib/cash/plans';
import { envelopeHistory, type HistoryPoint } from '@/lib/dashboard/actions';
import type { EnvelopeView } from '@/lib/dashboard/data';
import { monthLabel } from '@/lib/money';

/**
 * "חודשים קודמים": the envelope's last six months, newest on top, each with
 * the bar the card itself draws — so a month reads the same here as it did
 * on the dashboard at the time.
 */
export function HistorySheet({
  envelope,
  month,
  onClose,
}: {
  envelope: EnvelopeView;
  month: string;
  onClose: () => void;
}) {
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    envelopeHistory(month, envelope.type, envelope.title).then((result) => {
      if (!live) return;
      if (result.ok) setPoints(result.data);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [month, envelope.type, envelope.title]);

  const shown = (points ?? []).filter((p) => p.present).reverse();
  const average =
    shown.length > 1
      ? shown.slice(1).reduce((s, p) => s + p.actual, 0) / (shown.length - 1)
      : null;

  return (
    <Sheet open onClose={onClose} labelledBy="history-title">
      <div className="sheet-body">
        <h2 className="sheet-title" id="history-title">{envelope.title} · חודשים קודמים</h2>
        {error ? <p className="form-error">{error}</p> : null}
        {!points && !error ? <p className="picker-empty">טוען…</p> : null}
        {points && shown.length === 0 ? <p className="picker-empty">אין עדיין היסטוריה למעטפה הזו.</p> : null}

        {average !== null ? (
          <p className="history-average">
            בממוצע בחודשים הקודמים: <Amount value={average} decimals={0} />
          </p>
        ) : null}

        <ul className="history-list">
          {shown.map((point) => {
            const ratio = point.expected > 0 ? Math.min(point.actual / point.expected, 1) : point.actual > 0 ? 1 : 0;
            const over = point.expected > 0 && point.actual > point.expected;
            return (
              <li key={point.month} className="envelope history-row" data-type={envelope.type}>
                <div className="history-head">
                  <span className="history-month">{monthLabel(point.month)}</span>
                  <span className="history-figures">
                    <Amount value={point.actual} decimals={0} /> מתוך <Amount value={point.expected} decimals={0} />
                  </span>
                </div>
                <div className="bar">
                  <div className="bar-fill" data-nonzero={point.actual > 0} data-over={over} style={{ width: `${ratio * 100}%` }} />
                </div>
                {point.cash > 0 ? (
                  <p className="history-cash">
                    מתוכם במזומן <Amount value={point.cash} decimals={0} />
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}

/** Pick several cash spends in this envelope and file them elsewhere together. */
export function BulkMoveSheet({
  envelope,
  envelopes,
  onClose,
}: {
  envelope: EnvelopeView;
  envelopes: EnvelopeRef[];
  onClose: () => void;
}) {
  const spends = envelope.actuals.filter((a) => a.cash?.kind === 'spend');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const total = spends.filter((s) => selected.has(s.cash!.id)).reduce((sum, s) => sum + s.amountIls, 0);
  const destinations = envelopes.filter((e) => e.envelopeId !== envelope.envelopeId);

  return (
    <Sheet open onClose={onClose} labelledBy="bulk-title">
      <div className="sheet-body">
        <h2 className="sheet-title" id="bulk-title">להזיז הוצאות מזומן מ{envelope.title}</h2>
        <div className="check-list">
          {spends.map((s) => (
            <label key={s.cash!.id} className="check-row">
              <input type="checkbox" checked={selected.has(s.cash!.id)} onChange={() => toggle(s.cash!.id)} />
              <span className="check-date">{shortDate(s.transactionDate)}</span>
              <span className="check-label">{s.businessName}</span>
              <Amount value={s.amountIls} className="check-amount" />
            </label>
          ))}
        </div>

        <h3 className="picker-title">לאן?</h3>
        <div className="picker">
          {destinations.map((e) => (
            <button
              key={e.envelopeId}
              type="button"
              className="picker-row"
              data-selected={e.envelopeId === target}
              onClick={() => setTarget(e.envelopeId)}
            >
              <span className="picker-icon" data-type={e.type} aria-hidden="true">
                {e.type === 'variable' ? '⟳' : e.type === 'fixed' ? '⌂' : '◉'}
              </span>
              <span className="picker-label">{e.name}</span>
              <span className="picker-check" aria-hidden="true">✓</span>
            </button>
          ))}
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        <button
          className="btn"
          type="button"
          disabled={pending || selected.size === 0 || !target}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await moveCashSpendsToEnvelope([...selected], target!);
              if (result.ok) onClose();
              else setError(result.error);
            })
          }
        >
          {selected.size > 0 ? (
            <>
              להזיז {selected.size} הוצאות · <Amount value={total} />
            </>
          ) : (
            'בחרו הוצאות'
          )}
        </button>
      </div>
    </Sheet>
  );
}

/** Every active plan in one list, each opening its own sheet. */
export function PlansListSheet({
  plans,
  onOpen,
  onAdd,
  onClose,
}: {
  plans: CashPlan[];
  onOpen: (plan: CashPlan) => void;
  onAdd: (kind: 'spend' | 'income') => void;
  onClose: () => void;
}) {
  const describe = (plan: CashPlan) =>
    plan.recurrence === 'once'
      ? `פעם אחת · ${plan.day_of_month} ב${monthLabel(plan.starts_month)}`
      : `כל חודש ב-${plan.day_of_month}${plan.ends_month ? ` · עד ${monthLabel(plan.ends_month)}` : ''}`;

  const spends = plans.filter((p) => p.kind === 'spend');
  const incomes = plans.filter((p) => p.kind === 'income');

  const group = (title: string, list: CashPlan[]) =>
    list.length > 0 ? (
      <>
        <h3 className="picker-title">{title}</h3>
        {list.map((plan) => (
          <button key={plan.id} type="button" className="plan-list-row" onClick={() => onOpen(plan)}>
            <span className="plan-list-main">
              <span className="plan-list-name">{plan.note || plan.category}</span>
              <span className="plan-list-when">{describe(plan)}</span>
            </span>
            <Amount value={Number(plan.amount_ils)} />
          </button>
        ))}
      </>
    ) : null;

  return (
    <Sheet open onClose={onClose} labelledBy="plans-title">
      <div className="sheet-body">
        <h2 className="sheet-title" id="plans-title">מזומן צפוי</h2>
        {plans.length === 0 ? (
          <p className="picker-empty">
            עוד אין תכנונים. תכנון הוא הוצאה או הכנסה במזומן שאתם יודעים שתגיע — למשל עוזרת בית כל חודש — והיא נכנסת לתחזית עוד לפני שקרתה.
          </p>
        ) : null}
        {group('הוצאות', spends)}
        {group('הכנסות', incomes)}
        <div className="plan-now" style={{ borderBottom: 0, marginTop: 12 }}>
          <button className="btn" type="button" onClick={() => onAdd('spend')}>הוצאה צפויה חדשה</button>
          <button className="btn-ghost" type="button" onClick={() => onAdd('income')}>הכנסה צפויה חדשה</button>
        </div>
      </div>
    </Sheet>
  );
}
