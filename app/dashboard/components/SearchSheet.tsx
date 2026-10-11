'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import {
  MoveEnvelopeSheet,
  MoveMonthSheet,
  NoteSheet,
  SplitSheet,
  type CashAction,
} from '@/app/dashboard/components/CashActionSheets';
import { CashEntrySheet, type CashEntryDraft } from '@/app/dashboard/components/CashEntrySheet';
import { merchantLine, shortDate } from '@/app/dashboard/components/EnvelopeCard';
import { Close, Search } from '@/app/dashboard/components/icons';
import { ArrowBack, Spinner } from '@/app/dashboard/components/icons-extra';
import { TransactionSheet, type OpenTransaction } from '@/app/dashboard/components/TransactionSheet';
import { deleteCashEntry, markCashSpendAsSavings } from '@/lib/cash/actions';
import type { EnvelopeRef } from '@/lib/cash/envelopes';
import { searchTransactions, type SearchHit } from '@/lib/dashboard/actions';
import type { WalletSummary } from '@/lib/dashboard/data';
import type { SearchCursor } from '@/lib/dashboard/search';
import { monthLabel } from '@/lib/money';
import type { HouseholdMember } from '@/lib/types';

type Phase = 'idle' | 'loading' | 'done' | 'error';

/**
 * RiseUp's "חיפוש בתזרים", as a full page: a search line on top, an
 * illustration until something is typed, then every RiseUp charge and cash
 * entry that matches — by business, note, category or amount, across all
 * months — grouped by month, thirty at a time with "טען תוצאות ישנות יותר".
 * A result opens the same transaction sheet the dashboard opens.
 */
export function SearchSheet({
  envelopes,
  months,
  members,
  wallets,
  sessionMemberId,
  onClose,
  initialQuery = '',
  initialPhase = 'idle',
  initialHits = [],
  initialNext = null,
}: {
  envelopes: EnvelopeRef[];
  months: string[];
  members: Pick<HouseholdMember, 'id' | 'display_name'>[];
  wallets: WalletSummary[];
  sessionMemberId: string | null;
  onClose: () => void;
  /** Preview only: the page as it looks mid-search. */
  initialQuery?: string;
  initialPhase?: Phase;
  initialHits?: SearchHit[];
  initialNext?: SearchCursor | null;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [hits, setHits] = useState<SearchHit[]>(initialHits);
  const [next, setNext] = useState<SearchCursor | null>(initialNext);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState<{ hit: SearchHit; txn: OpenTransaction } | null>(null);
  const [action, setAction] = useState<CashAction | null>(null);
  const [draft, setDraft] = useState<CashEntryDraft | null>(null);
  const [, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const skipFirst = useRef(initialPhase !== 'idle');

  useEffect(() => {
    inputRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Debounced: a query per pause, not per letter.
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const q = query.trim();
    if (!q) {
      setPhase('idle');
      setHits([]);
      setNext(null);
      return;
    }
    let live = true;
    setPhase('loading');
    const timer = setTimeout(async () => {
      const result = await searchTransactions(q, null);
      if (!live) return;
      if (result.ok) {
        setHits(result.data.hits);
        setNext(result.data.next);
        setPhase('done');
      } else {
        setError(result.error);
        setPhase('error');
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, version]);

  const loadMore = async () => {
    if (!next) return;
    setLoadingMore(true);
    const result = await searchTransactions(query.trim(), next);
    setLoadingMore(false);
    if (result.ok) {
      setHits((current) => [...current, ...result.data.hits]);
      setNext(result.data.next);
    } else setError(result.error);
  };

  const refresh = () => setVersion((v) => v + 1);
  const closeTxn = () => {
    setAction(null);
    setOpen(null);
  };
  const closeAndRefresh = () => {
    closeTxn();
    refresh();
  };

  const openHit = (hit: SearchHit) => {
    if (hit.kind === 'withdrawal') {
      setDraft({
        id: hit.id,
        kind: 'withdrawal',
        fromBank: hit.fromBank,
        amountIls: hit.amountIls,
        category: hit.category ?? '',
        note: hit.note ?? '',
        date: hit.date,
        envelopeId: null,
        memberId: hit.memberId ?? sessionMemberId,
        walletId: hit.walletId,
      });
      return;
    }
    setOpen({
      hit,
      txn: { actual: hit.actual, envelopeTitle: hit.envelopeTitle, envelopeType: hit.envelopeType, envelopeId: hit.envelopeId },
    });
  };

  const groups: [string, SearchHit[]][] = [];
  for (const hit of hits) {
    const last = groups[groups.length - 1];
    if (last && last[0] === hit.month) last[1].push(hit);
    else groups.push([hit.month, [hit]]);
  }
  const oldest = hits[hits.length - 1]?.month ?? null;
  const current = open?.txn.actual ?? null;
  const kind = current?.cash?.kind ?? 'spend';

  return (
    <>
      <div className="search-page" role="dialog" aria-modal="true" aria-label="חיפוש בתזרים">
        <div className="search-bar">
          <button className="icon-btn" type="button" aria-label="חזרה" onClick={onClose}>
            <ArrowBack />
          </button>
          <span className="search-bar-icon" aria-hidden="true">
            {phase === 'loading' ? <Spinner /> : <Search size={22} />}
          </span>
          <input
            ref={inputRef}
            className="search-bar-input"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            placeholder="חיפוש בתזרים"
            aria-label="חיפוש בתזרים"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button className="search-clear" type="button" aria-label="ניקוי" onClick={() => setQuery('')}>
              <Close size={14} />
            </button>
          ) : null}
        </div>

        <div className="search-body">
          {phase === 'idle' || phase === 'loading' ? (
            <div className="search-empty">
              <SearchArt />
              <p>
                {phase === 'loading'
                  ? 'מחפשים עסקאות תואמות...'
                  : 'כאן ניתן לחפש הוצאות והכנסות בתזרים לפי שם עסק, הערה, קטגוריה או סכום, בכל החודשים.'}
              </p>
            </div>
          ) : null}

          {phase === 'error' ? <p className="form-error search-error">{error}</p> : null}

          {phase === 'done' && hits.length === 0 ? (
            <div className="search-empty">
              <SearchArt />
              <p>לא מצאנו עסקאות שמתאימות ל"{query.trim()}".</p>
            </div>
          ) : null}

          {phase === 'done'
            ? groups.map(([month, list]) => (
                <section key={month} className="search-month-group">
                  <h3 className="search-month-title">{monthLabel(month)}</h3>
                  {list.map((hit) => (
                    <div key={hit.key} className="envelope search-hit-wrap" data-type={hit.envelopeType}>
                      <button type="button" className="txn-row search-hit" onClick={() => openHit(hit)}>
                        <span className="date">{shortDate(hit.date)}</span>
                        <span className="amount">
                          {hit.kind !== 'spend' ? <span className="flow-sign" aria-hidden="true">+</span> : null}
                          <Amount value={hit.amountIls} />
                        </span>
                        <span className="merchant">
                          {hit.source === 'cash' ? <span className="cash-mark" aria-label="מזומן">₪</span> : null}
                          {hit.source === 'cash'
                            ? [hit.title, hit.category && hit.category !== hit.title ? hit.category : null].filter(Boolean).join(' · ')
                            : merchantLine(hit.actual)}
                        </span>
                        <span className="kebab" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                      </button>
                    </div>
                  ))}
                </section>
              ))
            : null}

          {phase === 'done' && hits.length > 0 ? (
            <div className="search-more">
              {next ? (
                <button className="btn-outline" type="button" disabled={loadingMore} onClick={loadMore}>
                  {loadingMore ? 'טוען…' : 'טען תוצאות ישנות יותר'}
                </button>
              ) : (
                <p className="search-end">אלה כל התוצאות.</p>
              )}
              {oldest ? <p className="search-range">(מציג תוצאות מ{monthLabel(oldest)})</p> : null}
            </div>
          ) : null}
        </div>
      </div>

      <TransactionSheet
        open={open !== null && action === null}
        onClose={() => setOpen(null)}
        transaction={open?.txn ?? null}
        walletName={current?.cash ? (wallets.find((w) => w.id === current.cash?.walletId)?.name ?? null) : null}
        onCashAction={setAction}
        onEditCash={() => {
          if (!open?.hit || !current?.cash) return;
          const hit = open.hit;
          closeTxn();
          setDraft({
            id: hit.id,
            kind: hit.kind,
            fromBank: hit.fromBank,
            amountIls: hit.amountIls,
            category: hit.category ?? '',
            note: hit.note ?? '',
            date: hit.date,
            envelopeId: hit.kind === 'spend' ? hit.envelopeId : null,
            memberId: hit.memberId ?? sessionMemberId,
            walletId: hit.walletId,
          });
        }}
        onSavings={() => {
          if (!current?.cash) return;
          const id = current.cash.id;
          closeTxn();
          start(async () => {
            await markCashSpendAsSavings(id);
            refresh();
          });
        }}
        onDeleteCash={() => {
          if (!current?.cash) return;
          const { id, kind: k } = current.cash;
          closeTxn();
          start(async () => {
            await deleteCashEntry(id, k);
            refresh();
          });
        }}
      />

      {current?.cash && action === 'note' ? <NoteSheet actual={current} kind={kind} onClose={closeAndRefresh} /> : null}
      {current?.cash && action === 'move' ? (
        <MoveEnvelopeSheet
          actual={current}
          kind={kind}
          envelopes={envelopes}
          currentEnvelopeId={open?.txn.envelopeId ?? null}
          onClose={closeAndRefresh}
        />
      ) : null}
      {current?.cash && action === 'split' ? (
        <SplitSheet
          actual={current}
          kind={kind}
          envelopes={envelopes}
          envelopeType={open?.txn.envelopeType}
          envelopeTitle={open?.txn.envelopeTitle}
          currentEnvelopeId={open?.txn.envelopeId ?? null}
          onClose={closeAndRefresh}
        />
      ) : null}
      {current?.cash && action === 'month' ? (
        <MoveMonthSheet actual={current} kind={kind} months={months} onClose={closeAndRefresh} />
      ) : null}

      {draft ? (
        <CashEntrySheet
          open
          draft={draft}
          envelopes={envelopes}
          members={members}
          wallets={wallets}
          onClose={() => {
            setDraft(null);
            refresh();
          }}
        />
      ) : null}
    </>
  );
}

/** A line drawing in RiseUp's sketchy style: a magnifier over a receipt. */
function SearchArt() {
  return (
    <svg
      className="search-art"
      viewBox="0 0 220 140"
      aria-hidden="true"
      fill="none"
      stroke="#1a1a1a"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M40 22h78l-2 96-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6z" />
      <path d="M54 44h48M54 58h40M54 72h46M54 86h28" strokeWidth="2.5" />
      <circle cx="146" cy="66" r="30" fill="#ffffff" />
      <circle cx="146" cy="66" r="22" strokeWidth="2" strokeDasharray="3 5" />
      <path d="M168 88l30 30" strokeWidth="9" />
      <path d="M134 56c4-6 12-8 18-5" strokeWidth="2.5" />
      <path d="M12 124c40-6 150-8 196-2" strokeWidth="2" strokeDasharray="1 7" />
    </svg>
  );
}
