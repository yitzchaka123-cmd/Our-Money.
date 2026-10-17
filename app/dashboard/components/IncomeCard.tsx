'use client';

import { useState } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { BucketRow } from '@/app/dashboard/components/EnvelopeCard';
import { ChevronDown, Kebab } from '@/app/dashboard/components/icons';
import { barRatio } from '@/lib/dashboard/bar';
import { buildBuckets } from '@/lib/dashboard/buckets';
import type { EnvelopeView } from '@/lib/dashboard/data';
import type { NormalizedActual } from '@/lib/riseup/envelopes';
import { formatAmount } from '@/lib/money';

/**
 * RiseUp's one "הכנסות" card (C34): what came in and what is expected, of
 * the fixed income (the salary, which RiseUp keeps as fixed income) and the
 * variable income together. The breakdown keeps them apart — "הכנסות
 * קבועות" first, with a salary not paid yet as "צפוי להיכנס", then "הכנסות
 * משתנות" — each section only when it has rows. The ⋮ is RiseUp's income
 * menu, which works on the variable part (lib/dashboard/income-card.ts).
 */
export function IncomeCard({
  variable,
  fixed,
  month,
  today,
  defaultOpen = false,
  onOpenTransaction,
  onMenu,
}: {
  variable: EnvelopeView | null;
  fixed: EnvelopeView | null;
  month: string;
  today: string;
  /** Renders the breakdown open — for the preview and the tests. */
  defaultOpen?: boolean;
  onOpenTransaction?: (actual: NormalizedActual, envelope: EnvelopeView) => void;
  onMenu?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const parts = [fixed, variable].filter((e): e is EnvelopeView => e !== null);
  const actual = round(parts.reduce((s, e) => s + e.actual, 0));
  const expected = round(parts.reduce((s, e) => s + e.expected, 0));
  const ratio = barRatio(actual, expected);

  const sections = [
    fixed ? { title: 'הכנסות קבועות', envelope: fixed } : null,
    variable ? { title: 'הכנסות משתנות', envelope: variable } : null,
  ]
    .filter((s): s is { title: string; envelope: EnvelopeView } => s !== null)
    .map((s) => ({
      ...s,
      buckets: buildBuckets(s.envelope.type, s.envelope.actuals, { today, month, upcoming: s.envelope.upcoming }),
    }))
    .filter((s) => s.buckets.length > 0);

  return (
    <article className="card envelope income-card" data-type="variableIncome">
      <div className="card-body">
        <div className="card-head">
          <h2 className="card-title">הכנסות</h2>
          <Kebab label="אפשרויות להכנסות" onClick={onMenu} />
        </div>

        <div className="envelope-figures">
          <div>
            <p className="figure-label">נכנס</p>
            <Amount value={actual} className="figure-actual" />
          </div>
          <div>
            <p className="figure-label">צפוי להיכנס</p>
            <Amount value={expected} className="figure-expected" />
          </div>
        </div>

        <div className="bar" role="img" aria-label={`${formatAmount(actual)} מתוך ${formatAmount(expected)}`}>
          <div className="bar-fill" data-nonzero={actual > 0} style={{ width: `${ratio * 100}%` }} />
        </div>
      </div>

      <button className="expander" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>פירוט הכנסות</span>
        <span className="chev">
          <ChevronDown />
        </span>
      </button>

      {open ? (
        <div className="breakdown">
          <div className="breakdown-head">
            <span />
            <span>נכנס</span>
            <span>צפוי להיכנס</span>
            <span />
          </div>
          {sections.length === 0 ? <p className="income-section-empty">עוד לא נכנסו הכנסות החודש.</p> : null}
          {sections.map((section, sectionIndex) => (
            <div key={section.title} className="income-section">
              <p className="income-section-title">{section.title}</p>
              {section.buckets.map((bucket, index) => (
                <BucketRow
                  key={bucket.key}
                  bucket={bucket}
                  upcomingLabel="צפוי להיכנס"
                  envelopeTitle={section.title}
                  defaultOpen={defaultOpen && sectionIndex === 0 && index === 0}
                  onOpenTransaction={(item) => onOpenTransaction?.(item, section.envelope)}
                  today={today}
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
