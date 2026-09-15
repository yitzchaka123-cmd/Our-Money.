'use client';

import { useState } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { ChevronDown } from '@/app/dashboard/components/icons';
import { buildBuckets, type Bucket } from '@/lib/dashboard/buckets';
import type { NormalizedActual } from '@/lib/riseup/envelopes';
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
}: EnvelopeCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const text = labels(type);

  // A bar with nothing planned still reads as "spent everything planned",
  // which is how RiseUp renders a fully-consumed variable envelope.
  const ratio = expected > 0 ? Math.min(actual / expected, 1) : 1;
  const remaining = Math.max(expected - actual, 0);
  const buckets = buildBuckets(type, actuals, { today, month });

  return (
    <article className="card envelope" data-type={type}>
      <div className="card-body">
        <div className="card-head">
          <h2 className="card-title">{title}</h2>
          <button className="kebab" type="button" aria-label={`אפשרויות ל${title}`}>
            ⋮
          </button>
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
          <div className="bar-fill" style={{ width: `${ratio * 100}%` }} />
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
  const [open, setOpen] = useState(defaultOpen && bucket.items.length > 0);
  const expandable = bucket.items.length > 0;

  return (
    <>
      <button
        className={bucket.isEmpty ? 'breakdown-row is-empty' : 'breakdown-row'}
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
        <span>
          <Amount value={bucket.expected ?? 0} />
        </span>
        <span className="chev">{expandable ? <ChevronDown size={18} /> : null}</span>
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
                ⋮
              </span>
              <span className="merchant">{merchantLine(item)}</span>
            </button>
          ))
        : null}
    </>
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
  const account = actual.accountNickname ?? actual.accountNumberHash;
  return [actual.businessName, account ? `כרטיס ${account}` : null]
    .filter(Boolean)
    .join(' ');
}
