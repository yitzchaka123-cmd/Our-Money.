'use client';

import { useState, useTransition } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import {
  MoveEnvelopeSheet,
  MoveMonthSheet,
  NoteSheet,
  SplitSheet,
  type CashAction,
} from '@/app/dashboard/components/CashActionSheets';
import { CashEntrySheet, emptyDraft, type CashEntryDraft } from '@/app/dashboard/components/CashEntrySheet';
import { EnvelopeCard } from '@/app/dashboard/components/EnvelopeCard';
import { TransactionSheet, type OpenTransaction } from '@/app/dashboard/components/TransactionSheet';
import { WalletCard } from '@/app/dashboard/components/WalletCard';
import { WalletsSheet } from '@/app/dashboard/components/WalletsSheet';
import { deleteCashEntry, deleteTransfer, markCashSpendAsSavings } from '@/lib/cash/actions';
import type { EnvelopeRef } from '@/lib/cash/envelopes';
import type { EnvelopeView, WalletMovement, WalletView } from '@/lib/dashboard/data';
import type { NormalizedActual } from '@/lib/riseup/envelopes';
import type { HouseholdMember } from '@/lib/types';

/**
 * Owns every sheet for the list — the transaction sheet, its action sub-sheets,
 * the cash entry sheet and the wallets sheet — so tapping anything anywhere
 * opens the same surfaces.
 */
export function EnvelopeList({
  envelopes,
  envelopeChoices,
  savingsEnvelopeId,
  wallet,
  members,
  months,
  sessionMemberId,
  month,
  today,
  totalActualExpenses,
  totalExpectedExpenses,
  expandAll = false,
}: {
  envelopes: EnvelopeView[];
  envelopeChoices: EnvelopeRef[];
  savingsEnvelopeId: string | null;
  wallet: WalletView;
  members: Pick<HouseholdMember, 'id' | 'display_name'>[];
  months: string[];
  sessionMemberId: string | null;
  month: string;
  today: string;
  totalActualExpenses: number;
  totalExpectedExpenses: number;
  expandAll?: boolean;
}) {
  const [openTxn, setOpenTxn] = useState<OpenTransaction | null>(null);
  const [action, setAction] = useState<CashAction | null>(null);
  const [draft, setDraft] = useState<CashEntryDraft | null>(null);
  const [walletsOpen, setWalletsOpen] = useState(false);
  const [, start] = useTransition();

  const walletName = (id: string | null | undefined): string | null =>
    wallet.wallets.find((w) => w.id === (id ?? wallet.wallets.find((x) => x.isDefault)?.id))?.name ?? null;

  const openNew = (kind: 'spend' | 'income', envelopeId: string | null = null) =>
    setDraft({ ...emptyDraft(kind, sessionMemberId), envelopeId });

  const toDraft = (actual: NormalizedActual, envelopeId: string | null): CashEntryDraft | null => {
    if (!actual.cash) return null;
    return {
      id: actual.cash.id,
      kind: actual.cash.kind,
      amountIls: actual.amountIls,
      category: actual.categoryLabel ?? '',
      note: actual.businessName === actual.categoryLabel ? '' : actual.businessName,
      date: actual.transactionDate ?? today,
      envelopeId: actual.cash.kind === 'spend' ? envelopeId : null,
      memberId: members.find((m) => m.display_name === actual.cash?.memberName)?.id ?? sessionMemberId,
      walletId: actual.cash.walletId,
    };
  };

  const closeAll = () => {
    setAction(null);
    setOpenTxn(null);
  };

  const openMovement = (m: WalletMovement) => {
    if (m.kind === 'withdrawal') return;
    if (m.kind === 'transfer') {
      if (window.confirm(`למחוק את ההעברה ${m.label}?`)) start(async () => { await deleteTransfer(m.id); });
      return;
    }
    setDraft({
      id: m.id,
      kind: m.kind === 'income' ? 'income' : 'spend',
      amountIls: m.amountIls,
      category: m.category ?? '',
      note: m.label === m.category ? '' : m.label,
      date: m.date,
      envelopeId: null,
      memberId: members.find((x) => x.display_name === m.memberName)?.id ?? sessionMemberId,
      walletId: m.walletId,
    });
  };

  const current = openTxn?.actual ?? null;
  const currentKind = current?.cash?.kind ?? 'spend';

  return (
    <>
      <WalletCard wallet={wallet} onOpenMovement={openMovement} onManage={() => setWalletsOpen(true)} />

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
            onOpenTransaction={(actual, envelopeTitle) =>
              setOpenTxn({ actual, envelopeTitle, envelopeType: envelope.type, envelopeId: envelope.envelopeId })
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
        open={openTxn !== null && action === null}
        onClose={() => setOpenTxn(null)}
        transaction={openTxn}
        walletName={current?.cash ? walletName(current.cash.walletId) : null}
        onCashAction={setAction}
        onEditCash={() => {
          if (!current || !openTxn) return;
          const d = toDraft(current, openTxn.envelopeId);
          closeAll();
          if (d) setDraft(d);
        }}
        onSavings={() => {
          if (!current?.cash) return;
          const id = current.cash.id;
          closeAll();
          start(async () => { await markCashSpendAsSavings(id); });
        }}
        onDeleteCash={() => {
          if (!current?.cash) return;
          const { id, kind } = current.cash;
          closeAll();
          start(async () => { await deleteCashEntry(id, kind); });
        }}
      />

      {current?.cash && action === 'note' ? <NoteSheet actual={current} kind={currentKind} onClose={closeAll} /> : null}
      {current?.cash && action === 'move' ? (
        <MoveEnvelopeSheet
          actual={current}
          kind={currentKind}
          envelopes={[...envelopeChoices, ...(savingsEnvelopeId && !envelopeChoices.some((e) => e.envelopeId === savingsEnvelopeId) ? [{ envelopeId: savingsEnvelopeId, type: 'riseupGoal' as const, name: 'הפקדות לחיסכון' }] : [])]}
          currentEnvelopeId={openTxn?.envelopeId ?? null}
          onClose={closeAll}
        />
      ) : null}
      {current?.cash && action === 'split' ? <SplitSheet actual={current} kind={currentKind} envelopes={envelopeChoices} onClose={closeAll} /> : null}
      {current?.cash && action === 'month' ? <MoveMonthSheet actual={current} kind={currentKind} months={months} onClose={closeAll} /> : null}

      {draft ? (
        <CashEntrySheet open draft={draft} envelopes={envelopeChoices} members={members} wallets={wallet.wallets} onClose={() => setDraft(null)} />
      ) : null}

      {walletsOpen ? <WalletsSheet wallets={wallet.wallets} members={members} onClose={() => setWalletsOpen(false)} /> : null}
    </>
  );
}

function SpendSummary({ actual, expected }: { actual: number; expected: number }) {
  return (
    <article className="card">
      <div className="card-body summary">
        סך כל ההוצאות עד עכשיו{' '}
        <span className="accent"><Amount value={actual} decimals={0} /></span>{' '}
        מתוך{' '}
        <span className="accent"><Amount value={expected} decimals={0} /></span>{' '}
        שהיו צפויים לצאת.
      </div>
    </article>
  );
}
