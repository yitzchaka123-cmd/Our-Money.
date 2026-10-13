'use client';

import { useCallback, useEffect, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from 'react';

import { BriefIntroArt, CoinStack, Sunburst } from '@/app/dashboard/components/BriefArt';
import { DailyBriefBlob } from '@/app/dashboard/components/Blob';
import { CashEntrySheet, type CashEntryDraft } from '@/app/dashboard/components/CashEntrySheet';
import { TransactionSheet, type OpenTransaction } from '@/app/dashboard/components/TransactionSheet';
import { Close } from '@/app/dashboard/components/icons';
import { confirmCashSpends } from '@/lib/cash/actions';
import type { EnvelopeRef } from '@/lib/cash/envelopes';
import { finishBrief } from '@/lib/dashboard/brief-actions';
import { briefDraft } from '@/lib/dashboard/entry-drafts';
import { proseAmount, type BriefData, type BriefItem, type RichText } from '@/lib/dashboard/brief';
import { cardsLeftAfter, openingStep } from '@/lib/dashboard/brief-deck';
import type { WalletSummary } from '@/lib/dashboard/data';
import type { HouseholdMember } from '@/lib/types';

/** How far a card has to travel before letting go moves on. */
const SWIPE_PX = 80;
/** The fly-out before the next card takes its place. */
const LEAVE_MS = 220;

type Leaving = 'left' | 'right' | 'down' | null;

/**
 * RiseUp's daily brief, for our own data: the green blob carries the number
 * of new things, and tapping it lays a deck of cards over the dashboard — an
 * intro, one card per new charge or cash entry, and "סיימנו להיום". Reaching
 * the last card marks everything read for this member.
 */
export function DailyBrief({
  brief,
  envelopes,
  members,
  wallets,
  sessionMemberId,
  initialStep,
}: {
  brief: BriefData;
  envelopes: EnvelopeRef[];
  members: Pick<HouseholdMember, 'id' | 'display_name'>[];
  wallets: WalletSummary[];
  sessionMemberId: string | null;
  /** Preview only: render the deck already open at this card. */
  initialStep?: number;
}) {
  const [open, setOpen] = useState(initialStep !== undefined);
  // The deck is frozen when it opens, so a refresh mid-way cannot reshuffle it.
  const [deck, setDeck] = useState<BriefItem[]>(brief.items);
  const [asOf, setAsOf] = useState(brief.asOf);
  const [step, setStep] = useState(initialStep ?? 0);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [leaving, setLeaving] = useState<Leaving>(null);
  const [finished, setFinished] = useState(false);
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set());
  const [editTxn, setEditTxn] = useState<OpenTransaction | null>(null);
  const [draft, setDraft] = useState<CashEntryDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const startPoint = useRef<{ x: number; y: number; id: number } | null>(null);

  const endStep = deck.length + 1;
  const atEnd = step >= endStep;
  const item = step >= 1 && step <= deck.length ? deck[step - 1]! : null;
  // A card that was edited shows its new figures once the page refreshes.
  const current = item ? (brief.items.find((i) => i.key === item.key) ?? item) : null;

  // Once the deck is read, the blob shows only what still waits for review —
  // until the page's data refreshes and the server's count takes over again.
  const count =
    finished && brief.asOf === asOf
      ? deck.filter((i) => i.needsReview && !confirmed.has(i.key)).length
      : brief.count;

  const openDeck = () => {
    setDeck(brief.items);
    setAsOf(brief.asOf);
    setStep(openingStep(brief.items.length));
    // Nothing new: the deck opens at "סיימנו להיום" with nothing to mark read.
    setFinished(brief.items.length === 0);
    setConfirmed(new Set());
    setError(null);
    setOpen(true);
  };

  // "/dashboard?brief=1" opens straight into the deck — for links from elsewhere,
  // like the drawer. With nothing new it opens at the end card, not nothing.
  useEffect(() => {
    if (initialStep !== undefined) return;
    if (new URLSearchParams(window.location.search).get('brief') === '1') openDeck();
    // Only on arrival.
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setDrag(null);
    setLeaving(null);
  }, []);

  // Reaching the end card is finishing: store the read point once.
  useEffect(() => {
    if (!open || !atEnd || finished || initialStep !== undefined) return;
    setFinished(true);
    start(async () => {
      const result = await finishBrief(asOf);
      if (!result.ok) setError(result.error);
    });
  }, [open, atEnd, finished, asOf, initialStep]);

  const advance = useCallback(
    (direction: Leaving) => {
      if (leaving) return;
      setLeaving(direction);
      window.setTimeout(() => {
        setLeaving(null);
        setDrag(null);
        if (direction === 'down') close();
        else setStep((s) => Math.min(s + 1, endStep));
      }, LEAVE_MS);
    },
    [leaving, close, endStep],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (editTxn || draft) return;
      if (event.key === 'Escape') close();
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !atEnd) advance(event.key === 'ArrowLeft' ? 'left' : 'right');
      if (event.key === 'ArrowDown' && atEnd) advance('down');
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, atEnd, advance, close, editTxn, draft]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (leaving) return;
    startPoint.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const from = startPoint.current;
    if (!from || from.id !== event.pointerId) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    setDrag(atEnd ? { dx: 0, dy: Math.max(dy, 0) } : { dx, dy: dy * 0.2 });
  };
  const onPointerUp = () => {
    const moved = drag;
    startPoint.current = null;
    if (!moved) return;
    if (atEnd && moved.dy > SWIPE_PX) advance('down');
    else if (!atEnd && Math.abs(moved.dx) > SWIPE_PX) advance(moved.dx < 0 ? 'left' : 'right');
    else setDrag(null);
  };

  const confirm = (target: BriefItem) => {
    const id = target.actual.cash?.id;
    if (!id) return;
    start(async () => {
      const result = await confirmCashSpends([id]);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmed((set) => new Set([...set, target.key]));
      advance('left');
    });
  };

  const edit = (target: BriefItem) => {
    if (target.kind === 'riseup') {
      setEditTxn({
        actual: target.actual,
        envelopeTitle: target.envelopeTitle,
        envelopeType: target.envelopeType === 'withdrawal' ? 'trackingCategory' : target.envelopeType,
        envelopeId: target.envelopeId,
      });
      return;
    }
    // The member who logged it stays theirs: matched by id, never by name.
    setDraft(briefDraft(target, sessionMemberId));
  };

  const transform = leaving
    ? leaving === 'down'
      ? 'translateY(120vh)'
      : `translateX(${leaving === 'left' ? '-' : ''}130vw) rotate(${leaving === 'left' ? '-' : ''}18deg)`
    : drag
      ? `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 18}deg)`
      : undefined;

  const behind = [step + 1, step + 2].filter((s) => s <= endStep);
  // Item cards after this one: the first of three says "נשארו עוד 2", as in RiseUp.
  const remaining = item ? cardsLeftAfter(step, deck.length) : 0;
  const reviewPending = current?.needsReview && !confirmed.has(current.key);

  return (
    <>
      {count > 0 && !open ? <DailyBriefBlob count={count} onOpen={openDeck} /> : null}

      {open ? (
        <div className="brief-overlay" role="dialog" aria-modal="true" aria-label="הסיכום היומי שלי">
          <button className="brief-close" type="button" aria-label="סגירה" onClick={close}>
            <Close size={30} />
          </button>

          <div className="brief-stage">
            <div className="brief-deck">
              {behind
                .slice()
                .reverse()
                .map((s) => (
                  <div key={s} className="brief-card brief-card--behind" data-depth={s - step} aria-hidden="true">
                    <CardFace step={s} deck={deck} total={deck.length} />
                  </div>
                ))}
              <div
                key={step}
                className="brief-card brief-card--top"
                data-dragging={drag !== null && !leaving}
                style={transform ? { transform } : undefined}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <CardFace step={step} deck={current ? deck.map((d) => (d.key === current.key ? current : d)) : deck} total={deck.length} />
              </div>
            </div>

            {step === 0 ? (
              <p className="brief-hint">גררו את הכרטיס לימין או לשמאל</p>
            ) : atEnd ? (
              <p className="brief-hint">גררו את הכרטיס למטה כדי לסיים</p>
            ) : current ? (
              <div className="brief-controls">
                {reviewPending ? (
                  <button className="brief-btn brief-btn--go" type="button" onClick={() => confirm(current)}>
                    לאשר
                  </button>
                ) : (
                  <button className="brief-btn brief-btn--go" type="button" onClick={() => advance('left')}>
                    להמשיך
                  </button>
                )}
                {/* Empty on the last card, keeping the buttons where they were. */}
                <span className="brief-left">{remaining > 0 ? `נשארו עוד ${remaining}` : ''}</span>
                <button className="brief-btn" type="button" onClick={() => edit(current)}>
                  לערוך
                </button>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="toast" role="alert" onClick={() => setError(null)}>
              {error}
            </div>
          ) : null}
        </div>
      ) : null}

      <TransactionSheet
        open={editTxn !== null}
        onClose={() => setEditTxn(null)}
        transaction={editTxn}
        walletName={null}
        onCashAction={() => setEditTxn(null)}
        onEditCash={() => setEditTxn(null)}
        onSavings={() => setEditTxn(null)}
        onDeleteCash={() => setEditTxn(null)}
      />
      {draft ? (
        <CashEntrySheet open draft={draft} envelopes={envelopes} members={members} wallets={wallets} onClose={() => setDraft(null)} />
      ) : null}
    </>
  );
}

function CardFace({ step, deck, total }: { step: number; deck: BriefItem[]; total: number }) {
  if (step === 0) return <IntroCard count={total} />;
  const item = deck[step - 1];
  if (!item) return <EndCard />;
  return <ItemCard item={item} />;
}

function IntroCard({ count }: { count: number }) {
  return (
    <div className="brief-intro">
      <p className="brief-kicker">- {count === 1 ? 'עדכון אחד חדש' : `${count} עדכונים חדשים`} -</p>
      <BriefIntroArt />
      <p className="brief-intro-title">כל מה שחדש אצלנו, בכמה החלקות</p>
      <p className="brief-intro-body">
        כרטיסייה לכל חיוב חדש מרייזאפ ולכל רישום מזומן מאז הפעם הקודמת. מדפדפים, עורכים איפה שצריך, וממשיכים הלאה.
      </p>
    </div>
  );
}

function EndCard() {
  return (
    <div className="brief-end">
      <Sunburst />
      <div className="brief-end-content">
        <CoinStack />
        <p className="brief-end-title">סיימנו להיום</p>
        <p className="brief-end-body">
          אלה כל העדכונים כרגע.
          <br />
          ניפגש מחר!
        </p>
      </div>
    </div>
  );
}

/** RiseUp prints the card's date as dd.mm.yy. */
function cardDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y?.slice(2)}`;
}

function CardAmount({ value }: { value: number }) {
  const magnitude = Math.round(Math.abs(value) * 100) / 100;
  const [integer, decimals] = magnitude.toFixed(2).split('.');
  const grouped = Number(integer).toLocaleString('en-US');
  return (
    <span className="brief-amount">
      <bdi>
        {grouped}
        {decimals !== '00' ? `.${decimals}` : ''}
      </bdi>
      <span className="brief-amount-cur">₪</span>
    </span>
  );
}

function ItemCard({ item }: { item: BriefItem }) {
  const meta = [cardDate(item.date), item.memberName].filter(Boolean).join(' · ');
  return (
    <div className="brief-item">
      <div className="brief-panel" data-type={item.envelopeType}>
        <p className="brief-cat">{item.label}</p>
        {item.needsReview ? <span className="brief-review">ממתין לאישור</span> : null}
        <div className="brief-main">
          <CardAmount value={item.amountIls} />
          <p className="brief-biz">{item.business}</p>
          <p className="brief-date">{meta}</p>
        </div>
        {item.account ? <p className="brief-account">{item.account}</p> : null}
      </div>
      {item.insight ? (
        <p className="brief-insight">
          <Rich text={item.insight.text} />
        </p>
      ) : null}
    </div>
  );
}

/** Prose with its amounts bold and coloured, the way RiseUp sets them. */
export function Rich({ text, className = 'rich-amount' }: { text: RichText; className?: string }) {
  return (
    <>
      {text.map((part, i) =>
        typeof part === 'string' ? (
          <span key={i}>{part}</span>
        ) : (
          <strong key={i} className={className}>
            <bdi>{proseAmount(part.amount, part.signed).replace(' ₪', '')}</bdi> ₪
          </strong>
        ),
      )}
    </>
  );
}
