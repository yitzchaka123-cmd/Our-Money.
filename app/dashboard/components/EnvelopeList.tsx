'use client';

import { useState, useTransition } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { CashEntrySheet, emptyDraft, type CashEntryDraft } from '@/app/dashboard/components/CashEntrySheet';
import { EnvelopeCard } from '@/app/dashboard/components/EnvelopeCard';
import { TransactionSheet, type OpenTransaction } from '@/app/dashboard/components/TransactionSheet';
import { WalletCard } from '@/app/dashboard/components/WalletCard';
import { deleteCashEntry } from '@/lib/cash/actions';
import type { EnvelopeRef } from '@/lib/cash/envelopes';
import type { EnvelopeView, WalletMovement, WalletView } from '@/lib/dashboard/data';
import type { NormalizedActual } from '@/lib/riseup/envelopes';
import type { HouseholdMember } from '@/lib/types';

/**
 * Owns the sheets for the whole list — one transaction sheet and one cash
 * entry sheet — so tapping anything anywhere opens the same surfaces.
 */
export function EnvelopeList({
  envelopes,
  envelopeChoices,
  wallet,
  members,
  sessionMemberId,
  month,
  today,
  totalActualExpenses,
  totalExpectedExpenses,
  expandAll = false,
}: {
  envelopes: EnvelopeView[];
  envelopeChoices: EnvelopeRef[];
  wallet: WalletView;
  members: Pick<HouseholdMember, 'id' | 'display_name'>[];
  sessionMemberId: string | null;
  month: string;
  today: string;
  totalActualExpenses: number;
  totalExpectedExpenses: number;
  expandAll?: boolean;
}) {
  const [openTxn, setOpenTxn] = useState<OpenTransaction | null>(null);
  const [draft, setDraft] = useState<CashEntryDraft | null>(null);
  const [, start] = useTransition();

  const openNew = (kind: 'spend' | 'income', envelopeId: string | null = null) =>
    setDraft({ ...emptyDraft(kind, sessionMemberId), envelopeId });

  const openEdit = (actual: NormalizedActual, fallbackEnvelopeId: string | null) => {
    if (!actual.cash) return;
    setOpenTxn(null);
    setDraft({
      id: actual.cash.id,
      kind: actual.cash.kind,
      amountIls: actual.amountIls,
      category: actual.categoryLabel ?? '',
      note: actual.businessName === actual.categoryLabel ? '' : actual.businessName,
      date: actual.transactionDate ?? today,
      envelopeId: actual.cash.kind === 'spend' ? fallbackEnvelopeId : null,
      memberId: members.find((m) => m.display_name === actual.cash?.memberName)?.id ?? sessionMemberId,
    });
  };

  const remove = (actual: NormalizedActual) => {
    if (!actual.cash) return;
    const { id, kind } = actual.cash;
    setOpenTxn(null);
    start(async () => {
      await deleteCashEntry(id, kind);
    });
  };

  const openMovement = (movement: WalletMovement) => {
    if (movement.kind === 'withdrawal') return;
    setDraft({
      id: movement.id,
      kind: movement.kind === 'income' ? 'income' : 'spend',
      amountIls: movement.amountIls,
      category: movement.category ?? '',
      note: movement.label === movement.category ? '' : movement.label,
      date: movement.date,
      envelopeId: null,
      memberId: members.find((m) => m.display_name === movement.memberName)?.id ?? sessionMemberId,
    });
  };

  return (
    <>
      <WalletCard wallet={wallet} onOpenMovement={openMovement} />

      <div className="add-row-pair">
        <button className="add-row" type="button" onClick={() => openNew('spend')}>
          <span className="add-plus" aria-hidden="true">+</span>
          <span>הוספת הוצאה במזומן</span>
        </button>
        <button className="add-row" type="button" onClick={() => openNew('income')}>
          <span className="add-plus add-plus--income" aria-hidden="true">+</span>
          <span>הוספת הכנסה במזומן</span>
        </button>
      </div>

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
              setOpenTxn({ actual, envelopeTitle, envelopeType: envelope.type })
            }
            onAddCash={
              envelope.type === 'cashIncome'
                ? () => openNew('income')
                : envelope.type === 'variableIncome' || envelope.type === 'riseupGoal'
                  ? undefined
                  : () => openNew('spend', envelope.envelopeId)
            }
          />
          {envelope.type === 'fixed' ? (
            <SpendSummary actual={totalActualExpenses} expected={totalExpectedExpenses} />
          ) : null}
        </div>
      ))}

      <TransactionSheet
        open={openTxn !== null}
        onClose={() => setOpenTxn(null)}
        transaction={openTxn}
        onEditCash={(actual) =>
          openEdit(
            actual,
            envelopes.find((e) => e.actuals.some((a) => a.transactionId === actual.transactionId))
              ?.envelopeId ?? null,
          )
        }
        onDeleteCash={remove}
      />

      {draft ? (
        <CashEntrySheet
          open
          draft={draft}
          envelopes={envelopeChoices}
          members={members}
          onClose={() => setDraft(null)}
        />
      ) : null}
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
