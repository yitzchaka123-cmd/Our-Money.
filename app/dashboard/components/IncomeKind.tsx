'use client';

import { useState, useTransition } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { shortDate } from '@/app/dashboard/components/EnvelopeCard';
import { Close } from '@/app/dashboard/components/icons';
import { Sheet } from '@/app/dashboard/components/Sheet';
import { setCashIncomeKind } from '@/lib/cash/income-actions';
import { DEFAULT_INCOME_CATEGORIES, INCOME_KINDS, OTHER_CATEGORY, type IncomeKind } from '@/lib/cash/income-kinds';
import type { NormalizedActual } from '@/lib/riseup/envelopes';

const KIND_ICONS: Record<IncomeKind, string> = { variable: '⟳', fixed: '▦', non_cashflow: '⊘' };

/**
 * RiseUp's "איזו הכנסה זו?": the kind (משתנה / קבועה / לא תזרימית) with what
 * it means, then the category — משכורת, דיור, קצבאות, every name used before,
 * or "אחר" to type a new one (which is then offered next time).
 */
export function IncomeKindFields({
  kind,
  category,
  choices = DEFAULT_INCOME_CATEGORIES,
  onChange,
}: {
  kind: IncomeKind;
  category: string;
  choices?: string[];
  onChange: (next: { kind?: IncomeKind; category?: string }) => void;
}) {
  const known = choices.includes(category.trim());
  const [typing, setTyping] = useState(!known && category.trim() !== '');
  const other = typing || (!known && category.trim() !== '');

  return (
    <div className="income-kind">
      <h3 className="picker-title">איזו הכנסה זו?</h3>
      <div className="picker income-kind-list" role="radiogroup" aria-label="איזו הכנסה זו?">
        {INCOME_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={kind === k.value}
            className="picker-row"
            data-selected={kind === k.value}
            onClick={() => onChange({ kind: k.value })}
          >
            <span className="picker-icon income-kind-icon" data-kind={k.value} aria-hidden="true">
              {KIND_ICONS[k.value]}
            </span>
            <span className="picker-label">{k.label}</span>
            <span className="picker-check" aria-hidden="true">
              ✓
            </span>
          </button>
        ))}
      </div>
      <p className="field-hint income-kind-hint">{INCOME_KINDS.find((k) => k.value === kind)?.hint}</p>

      <div className="field">
        <span>{kind === 'fixed' ? 'איזו הכנסה קבועה זו?' : 'קטגוריה'}</span>
        <div className="chips">
          {choices.map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              data-selected={!other && category.trim() === c}
              onClick={() => {
                setTyping(false);
                onChange({ category: c });
              }}
            >
              {c}
            </button>
          ))}
          <button
            type="button"
            className="chip"
            data-selected={other}
            onClick={() => {
              setTyping(true);
              if (known) onChange({ category: '' });
            }}
          >
            {OTHER_CATEGORY}
          </button>
        </div>
      </div>
      {other ? (
        <label className="field">
          <span>שם הקטגוריה</span>
          <input
            type="text"
            maxLength={40}
            placeholder="למשל: שיעורים פרטיים"
            value={category}
            onChange={(e) => onChange({ category: e.target.value })}
          />
        </label>
      ) : null}
    </div>
  );
}

/**
 * The sheet behind the transaction sheet's "איזו הכנסה זו?" for a cash
 * income: RiseUp's green header, then the kind and category, one button.
 */
export function IncomeKindSheet({
  actual,
  choices,
  onClose,
}: {
  actual: NormalizedActual;
  choices?: string[];
  onClose: () => void;
}) {
  const [kind, setKind] = useState<IncomeKind>(actual.cash?.incomeKind ?? 'variable');
  const [category, setCategory] = useState(actual.categoryLabel ?? '');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = () =>
    start(async () => {
      setError(null);
      const result = await setCashIncomeKind(actual.cash!.id, kind, category);
      if (result.ok) onClose();
      else setError(result.error);
    });

  return (
    <Sheet open onClose={onClose} labelledBy="income-kind-label">
      <div className="envelope" data-type="cashIncome">
        <div className="sheet-head" data-on-dark="true">
          <div className="entry-head-row">
            <p className="label" id="income-kind-label">
              הכנסה במזומן{actual.categoryLabel ? ` · ${actual.categoryLabel}` : ''}
            </p>
            <button className="entry-close" type="button" aria-label="סגירה" onClick={onClose}>
              <Close />
            </button>
          </div>
          <Amount value={actual.amountIls} className="figure" />
          {actual.businessName !== actual.categoryLabel ? <p className="meta">{actual.businessName}</p> : null}
          <p className="meta">{shortDate(actual.transactionDate)}</p>
        </div>
      </div>
      <div className="sheet-body">
        <IncomeKindFields
          kind={kind}
          category={category}
          choices={choices}
          onChange={(next) => {
            if (next.kind) setKind(next.kind);
            if (next.category !== undefined) setCategory(next.category);
          }}
        />
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn" type="button" disabled={pending || !category.trim()} onClick={save}>
          {pending ? '…' : 'שמירה'}
        </button>
      </div>
    </Sheet>
  );
}
