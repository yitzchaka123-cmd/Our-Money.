'use client';

import { useEffect, useRef, useState } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { CashEntrySheet, type CashEntryDraft } from '@/app/dashboard/components/CashEntrySheet';
import { shortDate } from '@/app/dashboard/components/EnvelopeCard';
import { Sheet } from '@/app/dashboard/components/Sheet';
import { Close } from '@/app/dashboard/components/icons';
import type { EnvelopeRef } from '@/lib/cash/envelopes';
import { searchTransactions, type SearchFilters, type SearchHit } from '@/lib/dashboard/actions';
import type { WalletSummary } from '@/lib/dashboard/data';
import { monthLabel } from '@/lib/money';
import type { HouseholdMember } from '@/lib/types';

type Range = 1 | 3 | 6 | 12;

function monthsBack(month: string, count: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year!, monthNumber! - count, 1)).toISOString().slice(0, 7);
}

/**
 * Search across everything — RiseUp's charges and our cash — by name,
 * category or exact amount, with the filters RiseUp's filter screen offers
 * plus the cash-only ones: which source, how far back, which wallet.
 */
export function SearchSheet({
  month,
  focus,
  envelopes,
  members,
  wallets,
  sessionMemberId,
  onClose,
}: {
  month: string;
  /** Which part to put the cursor in: the search box, or the filters. */
  focus: 'search' | 'filter';
  envelopes: EnvelopeRef[];
  members: Pick<HouseholdMember, 'id' | 'display_name'>[];
  wallets: WalletSummary[];
  sessionMemberId: string | null;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<SearchFilters['source']>('all');
  const [range, setRange] = useState<Range>(focus === 'filter' ? 1 : 3);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<CashEntryDraft | null>(null);
  const [version, setVersion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focus === 'search') inputRef.current?.focus();
  }, [focus]);

  // Debounced: typing a merchant name should not fire a query per letter.
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      const result = await searchTransactions({
        query,
        source: walletId ? 'cash' : source,
        fromMonth: monthsBack(month, range - 1),
        toMonth: month,
        walletId,
      });
      if (!live) return;
      setLoading(false);
      if (result.ok) {
        setHits(result.data);
        setError(null);
      } else setError(result.error);
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, source, range, walletId, month, version]);

  const groups = new Map<string, SearchHit[]>();
  for (const hit of hits ?? []) {
    const key = hit.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), hit]);
  }
  const spent = (hits ?? []).filter((h) => h.kind === 'spend').reduce((s, h) => s + h.amountIls, 0);

  const open = (hit: SearchHit) => {
    if (hit.source !== 'cash') return;
    setDraft({
      id: hit.id,
      kind: hit.kind,
      fromBank: hit.fromBank,
      amountIls: hit.amountIls,
      category: hit.category ?? '',
      note: hit.note ?? '',
      date: hit.date,
      envelopeId: null,
      memberId: hit.memberId ?? sessionMemberId,
      walletId: hit.walletId,
    });
  };

  const chip = <T,>(value: T, current: T, set: (v: T) => void, label: string) => (
    <button type="button" className="chip" data-selected={value === current} onClick={() => set(value)}>
      {label}
    </button>
  );

  return (
    <>
      <Sheet open={draft === null} onClose={onClose} labelledBy="search-title">
        <div className="sheet-body search-sheet">
          <div className="search-head">
            <h2 className="visually-hidden" id="search-title">חיפוש</h2>
            <input
              ref={inputRef}
              className="search-input"
              type="search"
              inputMode="search"
              placeholder="חיפוש לפי עסק, קטגוריה או סכום"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="entry-close" type="button" aria-label="סגירה" onClick={onClose}>
              <Close />
            </button>
          </div>

          <div className="search-filters">
            <div className="chips">
              {chip<SearchFilters['source']>('all', source, setSource, 'הכול')}
              {chip<SearchFilters['source']>('cash', source, setSource, 'מזומן')}
              {chip<SearchFilters['source']>('card', source, setSource, 'כרטיס ובנק')}
            </div>
            <div className="chips">
              {chip<Range>(1, range, setRange, monthLabel(month).split(' ')[0] ?? 'החודש')}
              {chip<Range>(3, range, setRange, '3 חודשים')}
              {chip<Range>(6, range, setRange, 'חצי שנה')}
              {chip<Range>(12, range, setRange, 'שנה')}
            </div>
            {wallets.length > 1 ? (
              <div className="chips">
                {chip<string | null>(null, walletId, setWalletId, 'כל הארנקים')}
                {wallets.map((w) => (
                  <span key={w.id}>{chip<string | null>(w.id, walletId, setWalletId, w.name)}</span>
                ))}
              </div>
            ) : null}
          </div>

          {error ? <p className="form-error">{error}</p> : null}
          {hits ? (
            <p className="search-summary">
              {loading ? 'מחפש…' : `${hits.length} תוצאות`}
              {spent > 0 ? (
                <>
                  {' '}· יצא <Amount value={spent} decimals={0} />
                </>
              ) : null}
            </p>
          ) : (
            <p className="search-summary">מחפש…</p>
          )}

          {[...groups.entries()].map(([key, list]) => (
            <section key={key} className="search-group">
              <h3 className="search-month">{monthLabel(key)}</h3>
              {list.map((hit) => (
                <button
                  key={hit.key}
                  type="button"
                  className="txn-row search-row"
                  disabled={hit.source !== 'cash'}
                  onClick={() => open(hit)}
                >
                  <span className="date">{shortDate(hit.date)}</span>
                  <span className="amount">
                    {hit.kind !== 'spend' ? <span className="flow-sign" aria-hidden="true">+</span> : null}
                    <Amount value={hit.amountIls} />
                  </span>
                  <span className="merchant">
                    {hit.source === 'cash' ? <span className="cash-mark" aria-label="מזומן">₪</span> : null}
                    {hit.title}
                    {hit.detail && hit.detail !== hit.title ? <span className="search-detail"> · {hit.detail}</span> : null}
                  </span>
                </button>
              ))}
            </section>
          ))}
        </div>
      </Sheet>

      {draft ? (
        <CashEntrySheet
          open
          draft={draft}
          envelopes={envelopes}
          members={members}
          wallets={wallets}
          onClose={() => {
            setDraft(null);
            setVersion((v) => v + 1);
          }}
        />
      ) : null}
    </>
  );
}
