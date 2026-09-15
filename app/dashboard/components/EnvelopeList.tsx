'use client';

import { useState } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { EnvelopeCard } from '@/app/dashboard/components/EnvelopeCard';
import {
  TransactionSheet,
  type OpenTransaction,
} from '@/app/dashboard/components/TransactionSheet';
import type { EnvelopeView } from '@/lib/dashboard/data';
import type { NormalizedActual } from '@/lib/riseup/envelopes';

/**
 * Owns the transaction sheet for the whole list, so tapping a charge in any
 * envelope opens one shared sheet rather than each card carrying its own.
 */
export function EnvelopeList({
  envelopes,
  month,
  today,
  totalActualExpenses,
  totalExpectedExpenses,
  expandAll = false,
}: {
  envelopes: EnvelopeView[];
  month: string;
  today: string;
  totalActualExpenses: number;
  totalExpectedExpenses: number;
  expandAll?: boolean;
}) {
  const [open, setOpen] = useState<OpenTransaction | null>(null);

  return (
    <>
      {envelopes.map((envelope) => (
        <div key={envelope.key}>
          <EnvelopeCard
            type={envelope.type}
            title={envelope.title}
            actual={envelope.actual}
            expected={envelope.expected}
            actuals={envelope.actuals}
            month={month}
            today={today}
            showRemaining={envelope.showRemaining}
            defaultOpen={expandAll}
            onOpenTransaction={(actual: NormalizedActual, envelopeTitle: string) =>
              setOpen({ actual, envelopeTitle, envelopeType: envelope.type })
            }
          />
          {envelope.type === 'fixed' ? (
            <SpendSummary actual={totalActualExpenses} expected={totalExpectedExpenses} />
          ) : null}
        </div>
      ))}

      <TransactionSheet
        open={open !== null}
        onClose={() => setOpen(null)}
        transaction={open}
      />
    </>
  );
}

function SpendSummary({ actual, expected }: { actual: number; expected: number }) {
  return (
    <article className="card">
      <div className="card-body summary">
        סך כל ההוצאות עד עכשיו{' '}
        <span className="accent">
          <Amount value={actual} decimals={0} />
        </span>{' '}
        מתוך{' '}
        <span className="accent">
          <Amount value={expected} decimals={0} />
        </span>{' '}
        שהיו צפויים לצאת.
      </div>
    </article>
  );
}
