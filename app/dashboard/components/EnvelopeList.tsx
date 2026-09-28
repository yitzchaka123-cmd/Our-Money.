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
import { EnvelopeMenu, type EnvelopeMenuAction } from '@/app/dashboard/components/EnvelopeMenu';
import { BulkMoveSheet, HistorySheet, PlansListSheet } from '@/app/dashboard/components/EnvelopeSheets';
import { newPlanDraft, PlanSheet, planToDraft, type PlanDraft } from '@/app/dashboard/components/PlanSheet';
import { TransferSheet } from '@/app/dashboard/components/TransferSheet';
import { TransactionSheet, type OpenTransaction } from '@/app/dashboard/components/TransactionSheet';
import { WalletCard } from '@/app/dashboard/components/WalletCard';
import { WalletsSheet } from '@/app/dashboard/components/WalletsSheet';
import { deleteCashEntry, markCashSpendAsSavings, type CashKind } from '@/lib/cash/actions';
import type { EnvelopeRef } from '@/lib/cash/envelopes';
import { settlePlan } from '@/lib/cash/plan-actions';
import type { CashPlan } from '@/lib/cash/plans';
import type { EnvelopeView, PendingPlanView, WalletMovement, WalletView } from '@/lib/dashboard/data';
import type { NormalizedActual } from '@/lib/riseup/envelopes';
import type { HouseholdMember } from '@/lib/types';

/**
 * Owns every sheet for the list — the transaction sheet, its action sub-sheets,
 * the cash entry sheet and the wallets sheet — so tapping anything anywhere
 * opens the same surfaces.
 */
export function EnvelopeList({
  envelopes,
  plans = [],
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
  plans?: CashPlan[];
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
  const [transfer, setTransfer] = useState<WalletMovement | null>(null);
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [menuFor, setMenuFor] = useState<EnvelopeView | null>(null);
  const [historyFor, setHistoryFor] = useState<EnvelopeView | null>(null);
  const [bulkFor, setBulkFor] = useState<EnvelopeView | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [, start] = useTransition();

  const pendingPlanIds = new Set(envelopes.flatMap((e) => e.pending.map((p) => p.planId)));

  const openPlan = (plan: CashPlan) => setPlanDraft(planToDraft(plan, envelopeChoices, pendingPlanIds.has(plan.id)));

  const openPending = (pending: PendingPlanView) => {
    const plan = plans.find((p) => p.id === pending.planId);
    if (plan) openPlan(plan);
  };

  const settle = (pending: PendingPlanView) =>
    start(async () => {
      const result = await settlePlan(pending.planId, month);
      setNotice(result.ok ? null : result.error);
    });

  const onMenuPick = (envelope: EnvelopeView, pick: EnvelopeMenuAction) => {
    setMenuFor(null);
    const income = envelope.type === 'cashIncome';
    const envelopeId = income ? null : envelope.envelopeId;
    if (pick === 'add-cash') openNew(income ? 'income' : 'spend', envelopeId);
    if (pick === 'add-plan') setPlanDraft(newPlanDraft(income ? 'income' : 'spend', month, today, sessionMemberId, envelopeId));
    if (pick === 'history') setHistoryFor(envelope);
    if (pick === 'bulk-move') setBulkFor(envelope);
    if (pick === 'plans') setPlansOpen(true);
  };

  const walletName = (id: string | null | undefined): string | null =>
    wallet.wallets.find((w) => w.id === (id ?? wallet.wallets.find((x) => x.isDefault)?.id))?.name ?? null;

  const openNew = (kind: CashKind, envelopeId: string | null = null) =>
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
    if (m.kind === 'transfer') {
      setTransfer(m);
      return;
    }
    setDraft({
      id: m.id,
      kind: m.kind,
      fromBank: m.fromBank,
      amountIls: m.amountIls,
      category: m.category ?? '',
      note: m.note ?? '',
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
      <WalletCard
        wallet={wallet}
        onOpenMovement={openMovement}
        onManage={() => setWalletsOpen(true)}
        onAddWithdrawal={() => openNew('withdrawal')}
      />

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
            pending={envelope.pending}
            pendingTotal={envelope.pendingTotal}
            onOpenPlan={openPending}
            onSettlePlan={settle}
            onMenu={() => setMenuFor(envelope)}
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

      {transfer ? <TransferSheet transfer={transfer} wallets={wallet.wallets} onClose={() => setTransfer(null)} /> : null}

      {menuFor ? (
        <EnvelopeMenu envelope={menuFor} onPick={(pick) => onMenuPick(menuFor, pick)} onClose={() => setMenuFor(null)} />
      ) : null}
      {historyFor ? <HistorySheet envelope={historyFor} month={month} onClose={() => setHistoryFor(null)} /> : null}
      {bulkFor ? <BulkMoveSheet envelope={bulkFor} envelopes={envelopeChoices} onClose={() => setBulkFor(null)} /> : null}
      {plansOpen ? (
        <PlansListSheet
          plans={plans}
          onOpen={(plan) => {
            setPlansOpen(false);
            openPlan(plan);
          }}
          onAdd={(kind) => {
            setPlansOpen(false);
            setPlanDraft(newPlanDraft(kind, month, today, sessionMemberId));
          }}
          onClose={() => setPlansOpen(false)}
        />
      ) : null}
      {planDraft ? (
        <PlanSheet
          draft={planDraft}
          month={month}
          envelopes={envelopeChoices}
          members={members}
          wallets={wallet.wallets}
          onClose={() => setPlanDraft(null)}
        />
      ) : null}
      {notice ? (
        <div className="toast" role="alert" onClick={() => setNotice(null)}>
          {notice}
        </div>
      ) : null}
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
