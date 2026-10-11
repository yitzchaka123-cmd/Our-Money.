'use client';

import { useState } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { ChevronDown, Kebab, Mic } from '@/app/dashboard/components/icons';
import { barRatio } from '@/lib/dashboard/bar';
import { buildBuckets, type Bucket } from '@/lib/dashboard/buckets';
import type { PendingPlanView } from '@/lib/dashboard/data';
import type { NormalizedActual, UpcomingCharge } from '@/lib/riseup/envelopes';
import { formatAmount } from '@/lib/money';
import type { EnvelopeType } from '@/lib/types';

export interface EnvelopeCardProps {
  type: EnvelopeType;
  title: string;
  actual: number;
  expected: number;
  actuals: NormalizedActual[];
  month: string;
  today: string;
  /** Tracking categories and savings show what is left; income and variable do not. */
  showRemaining?: boolean;
  /** Renders the breakdown open — used by the preview so it can be screenshotted. */
  defaultOpen?: boolean;
  onOpenTransaction?: (actual: NormalizedActual, envelopeTitle: string) => void;
  /** When set, the card offers to add a cash entry filed into this envelope. */
  onAddCash?: () => void;
  /** Expected cash still to come in this envelope this month. */
  pending?: PendingPlanView[];
  pendingTotal?: number;
  onOpenPlan?: (plan: PendingPlanView) => void;
  onSettlePlan?: (plan: PendingPlanView) => void;
  /** The card's ⋮. */
  onMenu?: () => void;
  /** Fixed charges still expected this month, shown greyed as "צפוי לרדת". */
  upcoming?: UpcomingCharge[];
  /** A tracker RiseUp keeps by the week: break it down by week. */
  weekly?: boolean;
}

/** Column wording differs per envelope type, exactly as RiseUp words it. */
interface Labels {
  actual: string;
  /** Column label on the card itself. */
  expected: string;
  /** Column label inside the breakdown table, which RiseUp words differently. */
  expectedInTable: string;
  expander: string;
}

function labels(type: EnvelopeType): Labels {
  switch (type) {
    case 'variableIncome':
      return {
        actual: 'נכנס',
        expected: 'צפוי להיכנס',
        expectedInTable: 'צפוי להיכנס',
        expander: 'פירוט הכנסות משתנות',
      };
    case 'cashIncome':
      return {
        actual: 'נכנס',
        expected: 'סה״כ החודש',
        expectedInTable: 'סה״כ',
        expander: 'פירוט הכנסות במזומן',
      };
    case 'variable':
      return {
        actual: 'יצא',
        expected: 'מומלץ להוציא עד',
        expectedInTable: 'נשאר להוציא',
        expander: 'פירוט שבועי',
      };
    default:
      return {
        actual: 'יצא',
        expected: 'צפוי לצאת',
        expectedInTable: 'צפוי לצאת',
        expander: 'פירוט חודשי',
      };
  }
}

export function EnvelopeCard({
  type,
  title,
  actual,
  expected,
  actuals,
  month,
  today,
  showRemaining = false,
  defaultOpen = false,
  onOpenTransaction,
  onAddCash,
  pending = [],
  pendingTotal = 0,
  onOpenPlan,
  onSettlePlan,
  onMenu,
  upcoming = [],
  weekly = false,
}: EnvelopeCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const text = weekly ? { ...labels(type), expander: 'פירוט שבועי' } : labels(type);

  // Empty when nothing is planned or spent; full (over budget) when money went
  // out with nothing planned.
  const ratio = barRatio(actual, expected);
  // Cash already promised is not free to spend, even before it goes out.
  const remaining = Math.max(expected - actual - pendingTotal, 0);
  const buckets = buildBuckets(type, actuals, { today, month, upcoming, weekly });

  return (
    <article className="card envelope" data-type={type}>
      <div className="card-body">
        <div className="card-head">
          <h2 className="card-title">{title}</h2>
          <Kebab label={`אפשרויות ל${title}`} onClick={onMenu} />
        </div>

        <div className="envelope-figures">
          <div>
            <p className="figure-label">{text.actual}</p>
            <Amount value={actual} className="figure-actual" />
          </div>
          <div>
            <p className="figure-label">{text.expected}</p>
            <Amount value={expected} className="figure-expected" />
          </div>
        </div>

        <div
          className="bar"
          role="img"
          aria-label={`${formatAmount(actual)} מתוך ${formatAmount(expected)}`}
        >
          <div
            className="bar-fill"
            data-nonzero={actual > 0}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>

        {showRemaining ? (
          <p className="bar-remaining">נשאר להוציא {formatAmount(remaining, 0)}</p>
        ) : null}
      </div>

      <button
        className="expander"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{text.expander}</span>
        <span className="chev">
          <ChevronDown />
        </span>
      </button>

      {open ? (
        <Breakdown
          buckets={buckets}
          labels={text}
          envelopeTitle={title}
          expandFirst={defaultOpen}
          onOpenTransaction={onOpenTransaction}
        />
      ) : null}

      {open && pending.length > 0 ? (
        <PendingRows
          pending={pending}
          income={type === 'cashIncome'}
          onOpenPlan={onOpenPlan}
          onSettlePlan={onSettlePlan}
        />
      ) : null}

      {open && onAddCash ? (
        <button className="add-row add-row--inline" type="button" onClick={onAddCash}>
          <span className="add-plus" aria-hidden="true">+</span>
          <span>{type === 'cashIncome' ? 'הוספת הכנסה במזומן' : 'הוספת הוצאה במזומן כאן'}</span>
        </button>
      ) : null}
    </article>
  );
}

function Breakdown({
  buckets,
  labels: text,
  envelopeTitle,
  expandFirst = false,
  onOpenTransaction,
}: {
  buckets: Bucket[];
  labels: Labels;
  envelopeTitle: string;
  expandFirst?: boolean;
  onOpenTransaction?: (actual: NormalizedActual, envelopeTitle: string) => void;
}) {
  return (
    <div className="breakdown">
      <div className="breakdown-head">
        <span />
        <span>{text.actual}</span>
        <span>{text.expectedInTable}</span>
        <span />
      </div>
      {buckets.map((bucket, index) => (
        <BucketRow
          key={bucket.key}
          bucket={bucket}
          envelopeTitle={envelopeTitle}
          defaultOpen={expandFirst && index === 0}
          onOpenTransaction={onOpenTransaction}
        />
      ))}
    </div>
  );
}

function BucketRow({
  bucket,
  envelopeTitle,
  defaultOpen = false,
  onOpenTransaction,
}: {
  bucket: Bucket;
  envelopeTitle: string;
  defaultOpen?: boolean;
  onOpenTransaction?: (actual: NormalizedActual, envelopeTitle: string) => void;
}) {
  const expandable = bucket.items.length > 0 || bucket.upcoming.length > 0;
  const [open, setOpen] = useState(defaultOpen && expandable);

  return (
    <>
      <button
        className={
          bucket.isEmpty ? 'breakdown-row is-empty' : bucket.isUpcoming ? 'breakdown-row is-upcoming' : 'breakdown-row'
        }
        type="button"
        aria-expanded={expandable ? open : undefined}
        disabled={!expandable}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="bucket">
          {bucket.isCurrent ? (
            <span className="bucket-pill">{bucket.label}</span>
          ) : (
            bucket.label
          )}
        </span>
        <span className="actual">
          <Amount value={bucket.actual} />
        </span>
        <span className="expected">
          <Amount value={bucket.expected ?? 0} />
        </span>
        <span className="chev">{expandable ? <ChevronDown size={14} /> : null}</span>
      </button>

      {open
        ? bucket.items.map((item) => (
            <button
              key={item.transactionId}
              className="txn-row"
              type="button"
              onClick={() => onOpenTransaction?.(item, envelopeTitle)}
            >
              <span className="date">{shortDate(item.transactionDate)}</span>
              <span className="amount">
                <Amount value={item.amountIls} />
              </span>
              <span className="kebab" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="merchant">
                {item.cash ? (
                  <span className="cash-mark" aria-label="מזומן">
                    {item.cash.inputKind === 'voice' ? <Mic /> : '₪'}
                  </span>
                ) : null}
                {merchantLine(item)}
                {item.cash?.status === 'needs_review' ? (
                  <span className="pill">לאישור</span>
                ) : null}
              </span>
            </button>
          ))
        : null}

      {open
        ? bucket.upcoming.map((charge) => (
            <div key={charge.key} className="txn-row is-upcoming">
              <span className="date">צפוי לרדת</span>
              <span className="amount">
                <Amount value={charge.amountIls} />
              </span>
              <span className="merchant">{charge.businessName || charge.categoryLabel || 'חיוב קבוע'}</span>
            </div>
          ))
        : null}
    </>
  );
}

/**
 * Expected cash still to come, under the month's real rows: greyed like
 * RiseUp's predicted charges, with a one-tap "paid" on each.
 */
function PendingRows({
  pending,
  income,
  onOpenPlan,
  onSettlePlan,
}: {
  pending: PendingPlanView[];
  income: boolean;
  onOpenPlan?: (plan: PendingPlanView) => void;
  onSettlePlan?: (plan: PendingPlanView) => void;
}) {
  return (
    <div className="pending-block">
      <p className="pending-title">{income ? 'צפוי להיכנס במזומן' : 'צפוי לצאת במזומן'}</p>
      {pending.map((plan) => (
        <div key={plan.planId} className="txn-row pending-row">
          <button type="button" className="pending-open" onClick={() => onOpenPlan?.(plan)}>
            <span className="date">{shortDate(plan.date)}</span>
            <span className="amount">
              <Amount value={plan.amountIls} />
            </span>
            <span className="merchant">
              <span className="cash-mark" aria-label="מזומן">₪</span>
              {[plan.label, plan.memberName].filter(Boolean).join(' · ')}
              {plan.recurrence === 'monthly' ? <span className="pending-repeat"> · כל חודש</span> : null}
            </span>
          </button>
          <button type="button" className="settle-pill" onClick={() => onSettlePlan?.(plan)}>
            {income ? 'התקבל' : 'שולם'}
          </button>
        </div>
      ))}
    </div>
  );
}

/** RiseUp writes dates as d.m.yy — "2.9.26". */
export function shortDate(iso: string | null): string {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return '';
  return `${Number(day)}.${Number(month)}.${year.slice(2)}`;
}

export function merchantLine(actual: NormalizedActual): string {
  if (actual.cash) {
    return [actual.businessName, actual.cash.memberName].filter(Boolean).join(' · ');
  }
  const account = actual.accountNickname ?? actual.accountNumberHash;
  return [actual.businessName, account ? `כרטיס ${account}` : null]
    .filter(Boolean)
    .join(' ');
}
