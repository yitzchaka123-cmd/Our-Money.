'use client';

import { useState, useTransition } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { CashEntrySheet, type CashEntryDraft } from '@/app/dashboard/components/CashEntrySheet';
import { shortDate } from '@/app/dashboard/components/EnvelopeCard';
import { Mic } from '@/app/dashboard/components/icons';
import { confirmCashSpends, deleteCashEntry } from '@/lib/cash/actions';
import type { EnvelopeRef } from '@/lib/cash/envelopes';
import type { WalletSummary } from '@/lib/dashboard/data';
import { friendlyDate } from '@/lib/money';
import type { CashSpend, HouseholdMember } from '@/lib/types';

/**
 * The review queue: each unsure entry with confirm, fix and delete in reach,
 * plus "confirm all" for the common case where the guesses were right.
 */
export function DailyList({
  toReview,
  recent,
  members,
  envelopes,
  wallets,
  today,
}: {
  toReview: CashSpend[];
  recent: CashSpend[];
  members: Pick<HouseholdMember, 'id' | 'display_name'>[];
  envelopes: EnvelopeRef[];
  wallets: WalletSummary[];
  today: string;
}) {
  const [draft, setDraft] = useState<CashEntryDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const names = new Map(members.map((m) => [m.id, m.display_name]));

  const run = (task: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const result = await task();
      if (!result.ok) setError(result.error ?? 'משהו השתבש.');
    });

  const edit = (spend: CashSpend) =>
    setDraft({
      id: spend.id,
      kind: 'spend',
      amountIls: Number(spend.amount_ils),
      category: spend.category,
      note: spend.note ?? '',
      date: spend.spent_at,
      envelopeId: spend.envelope_id,
      memberId: spend.member_id,
      walletId: spend.wallet_id,
    });

  const card = (spend: CashSpend, review: boolean) => (
    <article key={spend.id} className="card envelope daily-card" data-type={review ? 'cashUnlogged' : 'cash'}>
      <div className="card-body">
        <div className="card-head" style={{ marginBottom: 10 }}>
          <h3 className="card-title" style={{ fontSize: 17 }}>{spend.note || spend.category}</h3>
          <Amount value={Number(spend.amount_ils)} className="figure-actual" />
        </div>
        <p className="daily-meta">
          {spend.input_kind === 'voice' ? (
            <span style={{ marginInlineEnd: 6, verticalAlign: 'middle' }}>
              <Mic />
            </span>
          ) : null}
          {spend.category} · {names.get(spend.member_id) ?? '—'} · {friendlyDate(spend.spent_at, today)}
        </p>
        {spend.transcript ? <p className="daily-transcript">“{spend.transcript}”</p> : null}
        <p className="daily-date">{shortDate(spend.spent_at)}</p>

        <div className="daily-actions">
          {review ? (
            <button className="settle-pill" type="button" disabled={pending} onClick={() => run(() => confirmCashSpends([spend.id]))}>
              נכון, לאשר
            </button>
          ) : null}
          <button className="daily-link" type="button" disabled={pending} onClick={() => edit(spend)}>
            לתקן
          </button>
          <button className="daily-link daily-link--danger" type="button" disabled={pending} onClick={() => run(() => deleteCashEntry(spend.id, 'spend'))}>
            למחוק
          </button>
        </div>
      </div>
    </article>
  );

  return (
    <>
      {error ? <p className="form-error" style={{ padding: '0 var(--page-gutter)' }}>{error}</p> : null}

      {toReview.length > 1 ? (
        <div className="section">
          <button className="btn" type="button" disabled={pending} onClick={() => run(() => confirmCashSpends(toReview.map((s) => s.id)))}>
            לאשר את כל {toReview.length}
          </button>
        </div>
      ) : null}

      {toReview.length > 0 ? <div className="section">{toReview.map((s) => card(s, true))}</div> : null}

      <h2 className="page-title" style={{ fontSize: 20 }}>נרשם לאחרונה</h2>
      <div className="section">
        {recent.map((s) => card(s, false))}
        {recent.length === 0 ? (
          <article className="card">
            <div className="card-body notice">
              <p>עוד לא נרשמו הוצאות מזומן.</p>
            </div>
          </article>
        ) : null}
      </div>

      {draft ? (
        <CashEntrySheet open draft={draft} envelopes={envelopes} members={members} wallets={wallets} onClose={() => setDraft(null)} />
      ) : null}
    </>
  );
}
