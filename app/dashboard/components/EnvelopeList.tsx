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
import { AddTrackerButton, AddTrackerSheet } from '@/app/dashboard/components/AddTrackerSheet';
import { EnvelopeCard } from '@/app/dashboard/components/EnvelopeCard';
import { EnvelopeMenu, type EnvelopeMenuAction } from '@/app/dashboard/components/EnvelopeMenu';
import { BulkMoveSheet, HistorySheet, PlansListSheet } from '@/app/dashboard/components/EnvelopeSheets';
import { newPlanDraft, PlanSheet, planToDraft, type PlanDraft } from '@/app/dashboard/components/PlanSheet';
import { TrackerSheets, type TrackerSheetKind } from '@/app/dashboard/components/TrackerSheets';
import { TransferSheet } from '@/app/dashboard/components/TransferSheet';
import { TransactionSheet, type OpenTransaction } from '@/app/dashboard/components/TransactionSheet';
import { WalletCard } from '@/app/dashboard/components/WalletCard';
import { WalletMovementOverlays } from '@/app/dashboard/components/WalletMovementSheet';
import { WalletsSheet, type WalletsSheetFocus } from '@/app/dashboard/components/WalletsSheet';
import { deleteCashEntry, markCashSpendAsSavings, type CashKind } from '@/lib/cash/actions';
import type { EnvelopeRef } from '@/lib/cash/envelopes';
import { settlePlan } from '@/lib/cash/plan-actions';
import type { CashPlan } from '@/lib/cash/plans';
import type { EnvelopeView, PendingPlanView, WalletMovement, WalletView } from '@/lib/dashboard/data';
import { actualDraft, movementDraft } from '@/lib/dashboard/entry-drafts';
import { movementTransaction } from '@/lib/dashboard/movement-transaction';
import { summarySlot } from '@/lib/dashboard/summary-slot';
import { addTrackerSlot } from '@/lib/dashboard/trackers';
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
  const [walletsFocus, setWalletsFocus] = useState<WalletsSheetFocus | null>(null);
  const [transfer, setTransfer] = useState<WalletMovement | null>(null);
  const [movement, setMovement] = useState<{ movement: WalletMovement; action: CashAction | null } | null>(null);
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [menuFor, setMenuFor] = useState<EnvelopeView | null>(null);
  const [historyFor, setHistoryFor] = useState<EnvelopeView | null>(null);
  const [bulkFor, setBulkFor] = useState<EnvelopeView | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const [trackerSheet, setTrackerSheet] = useState<{ kind: TrackerSheetKind; envelope: EnvelopeView } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, start] = useTransition();

  const [addTrackerOpen, setAddTrackerOpen] = useState(false);
  // RiseUp's "הוספת קטגוריה למעקב" sits right after the trackers.
  const trackers = envelopes.filter((e) => e.type === 'trackingCategory');
  const addTrackerAfter = addTrackerSlot(envelopes);

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
    if (pick === 'history' && (envelope.type === 'trackingCategory' || envelope.type === 'variableIncome')) {
      setTrackerSheet({ kind: 'tracker-history', envelope });
    } else if (pick === 'history') setHistoryFor(envelope);
    if (pick === 'edit-target' || pick === 'rename' || pick === 'hide' || pick === 'income-target' || pick === 'move-incomes') {
      setTrackerSheet({ kind: pick, envelope });
    }
    if (pick === 'add-income') openNew('income');
    if (pick === 'bulk-move') setBulkFor(envelope);
    if (pick === 'plans') setPlansOpen(true);
  };

  const walletName = (id: string | null | undefined): string | null =>
    wallet.wallets.find((w) => w.id === (id ?? wallet.wallets.find((x) => x.isDefault)?.id))?.name ?? null;

  const openNew = (kind: CashKind, envelopeId: string | null = null) =>
    setDraft({ ...emptyDraft(kind, sessionMemberId), envelopeId });

  // An edit keeps the member who logged the entry: matched by id, never by name.
  const toDraft = (actual: NormalizedActual, envelopeId: string | null): CashEntryDraft | null =>
    actualDraft(actual, envelopeId, sessionMemberId, today);

  const closeAll = () => {
    setAction(null);
    setOpenTxn(null);
  };

  // A wallet row opens the transaction sheet, like a row in an envelope: a
  // spend or income its envelope row's sheet, a withdrawal or money added the
  // same kind of sheet for it (V4-07).
  const openMovement = (m: WalletMovement) => {
    if (m.kind === 'transfer') {
      setTransfer(m);
      return;
    }
    const txn = movementTransaction(envelopes, m);
    if (txn) setOpenTxn(txn);
    else setMovement({ movement: m, action: null });
  };
  const closeMovement = () => setMovement(null);

  const current = openTxn?.actual ?? null;
  const currentKind = current?.cash?.kind ?? 'spend';

  // RiseUp's order: variable, trackers, "הוספת קטגוריה למעקב", fixed, the
  // spending summary (once), then income and savings. With no fixed envelope
  // the summary follows the trackers and their add button instead.
  const summaryAfter = summarySlot(envelopes);

  return (
    <>
      <WalletCard
        wallet={wallet}
        onOpenMovement={openMovement}
        onManage={() => setWalletsFocus({})}
        onAddWithdrawal={() => openNew('withdrawal')}
        onAddSpend={() => openNew('spend')}
        onAddMoney={() => setWalletsFocus({ walletId: wallet.wallets.find((w) => w.isDefault)?.id ?? wallet.wallets[0]?.id, panel: 'add' })}
        onOpenWallet={(walletId) => setWalletsFocus({ walletId })}
      />

      {envelopes.map((envelope) => (
        <div key={envelope.key}>
          <EnvelopeCard
            type={envelope.type}
            title={envelope.title}
            actual={envelope.actual}
            expected={envelope.expected}
            actuals={envelope.actuals}
            upcoming={envelope.upcoming}
            weekly={envelope.weekly}
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
          {envelope.key === addTrackerAfter ? <AddTrackerButton onClick={() => setAddTrackerOpen(true)} /> : null}
          {envelope.key === summaryAfter ? (
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
      {current?.cash && action === 'split' ? <SplitSheet actual={current} kind={currentKind} envelopes={envelopeChoices} envelopeType={openTxn?.envelopeType} envelopeTitle={openTxn?.envelopeTitle} currentEnvelopeId={openTxn?.envelopeId ?? null} onClose={closeAll} /> : null}
      {current?.cash && action === 'month' ? <MoveMonthSheet actual={current} kind={currentKind} months={months} onClose={closeAll} /> : null}

      {draft ? (
        <CashEntrySheet open draft={draft} envelopes={envelopeChoices} members={members} wallets={wallet.wallets} onClose={() => setDraft(null)} />
      ) : null}

      {walletsFocus ? (
        <WalletsSheet wallets={wallet.wallets} members={members} movements={wallet.movements} focus={walletsFocus} onClose={() => setWalletsFocus(null)} />
      ) : null}

      {transfer ? <TransferSheet transfer={transfer} wallets={wallet.wallets} onClose={() => setTransfer(null)} /> : null}
      {movement ? (
        <WalletMovementOverlays
          open={movement}
          months={months}
          onAction={(action) => setMovement({ ...movement, action })}
          onEdit={() => {
            closeMovement();
            setDraft(movementDraft(movement.movement, sessionMemberId));
          }}
          onDelete={() => {
            const { id } = movement.movement;
            closeMovement();
            start(async () => { await deleteCashEntry(id, 'withdrawal'); });
          }}
          onOpenWallet={() => {
            closeMovement();
            setWalletsFocus({ walletId: movement.movement.walletId ?? undefined, panel: 'set' });
          }}
          onClose={closeMovement}
        />
      ) : null}

      {menuFor ? (
        <EnvelopeMenu envelope={menuFor} onPick={(pick) => onMenuPick(menuFor, pick)} onClose={() => setMenuFor(null)} />
      ) : null}
      {trackerSheet ? (
        <TrackerSheets
          kind={trackerSheet.kind}
          envelope={trackerSheet.envelope}
          envelopes={envelopes}
          month={month}
          months={months}
          onSwitch={(kind) => setTrackerSheet({ kind, envelope: trackerSheet.envelope })}
          onClose={() => setTrackerSheet(null)}
        />
      ) : null}
      {addTrackerOpen ? (
        <AddTrackerSheet month={month} trackedNames={trackers.map((t) => t.title)} onClose={() => setAddTrackerOpen(false)} />
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
