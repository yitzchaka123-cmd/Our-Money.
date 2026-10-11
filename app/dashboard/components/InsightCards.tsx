'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { CoinFace, InsightArtwork } from '@/app/dashboard/components/InsightArt';
import { Rich } from '@/app/dashboard/components/DailyBrief';
import { Close, Heart } from '@/app/dashboard/components/icons';
import { dismissInsight, rateInsight, restoreInsight } from '@/lib/dashboard/insight-actions';
import type { Insight } from '@/lib/dashboard/insights';

/** How long "ביטול" stays on offer after an X. */
const UNDO_MS = 5000;

/**
 * RiseUp's row of insight cards at the top of the page: swipe between them,
 * X to dismiss (with an undo), tap for the full explanation, and say whether
 * it helped. A dismissed card never comes back for the same thing.
 */
export function InsightCards({
  insights,
  initialOpenKey,
}: {
  insights: Insight[];
  /** Preview only: render with this card's popup open. */
  initialOpenKey?: string;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [undo, setUndo] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(initialOpenKey ?? null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState(0);
  const [, start] = useTransition();
  const timer = useRef<number | null>(null);
  const track = useRef<HTMLDivElement | null>(null);

  const visible = insights.filter((i) => !hidden.has(i.key));
  const opened = insights.find((i) => i.key === openKey) ?? null;

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const dismiss = (key: string) => {
    setHidden((set) => new Set([...set, key]));
    setUndo(key);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
    start(async () => {
      await dismissInsight(key);
    });
  };

  const restore = () => {
    const key = undo;
    if (!key) return;
    setUndo(null);
    setHidden((set) => new Set([...set].filter((k) => k !== key)));
    start(async () => {
      await restoreInsight(key);
    });
  };

  const answer = (key: string, helpful: boolean) => {
    setAnswers((a) => ({ ...a, [key]: helpful }));
    start(async () => {
      await rateInsight(key, helpful);
    });
  };

  // Which card is in view, for the dots. RTL scrolls into negative offsets.
  const onScroll = () => {
    const el = track.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    const step = first.offsetWidth + 12;
    setActive(Math.min(Math.round(Math.abs(el.scrollLeft) / step), visible.length - 1));
  };

  if (visible.length === 0 && !undo) return null;

  return (
    <section className="ins-section" aria-label="תובנות">
      {visible.length > 0 ? (
        <>
          <div className="ins-track" ref={track} onScroll={onScroll}>
            {visible.map((insight) => (
              <article key={insight.key} className="ins-card">
                <div className="ins-art">
                  <InsightArtwork art={insight.art} />
                  <button className="ins-x" type="button" aria-label="לא להציג שוב" onClick={() => dismiss(insight.key)}>
                    <Close size={14} />
                  </button>
                </div>
                <button className="ins-text" type="button" onClick={() => setOpenKey(insight.key)}>
                  <strong>{insight.title}</strong> <Rich text={insight.body} className="ins-amount" />
                </button>
                <div className="ins-foot">
                  <button className="btn" type="button" onClick={() => setOpenKey(insight.key)}>
                    לפרטים נוספים
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="ins-dots" aria-hidden="true">
            {visible.length > 1
              ? visible.map((insight, i) => <span key={insight.key} className="dot" data-active={i === active} />)
              : null}
          </div>
        </>
      ) : null}

      {undo ? (
        <div className="ins-snackbar" role="status">
          <span>ההודעה לא תוצג יותר</span>
          <button type="button" onClick={restore}>
            ביטול
          </button>
        </div>
      ) : null}

      {opened ? (
        <InsightPopup
          insight={opened}
          answer={answers[opened.key] ?? opened.helpful}
          onAnswer={(helpful) => answer(opened.key, helpful)}
          onClose={() => setOpenKey(null)}
        />
      ) : null}
    </section>
  );
}

function InsightPopup({
  insight,
  answer,
  onAnswer,
  onClose,
}: {
  insight: Insight;
  answer: boolean | null;
  onAnswer: (helpful: boolean) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="ins-modal" role="dialog" aria-modal="true" aria-labelledby="ins-modal-title">
        <div className="ins-modal-head">
          <button className="ins-modal-x" type="button" aria-label="סגירה" onClick={onClose}>
            <Close size={26} />
          </button>
          <h2 id="ins-modal-title">{insight.detail.heading}</h2>
        </div>
        <div className="ins-modal-body">
          {insight.detail.paragraphs.map((paragraph, i) => (
            <p key={i}>
              <Rich text={paragraph} className="ins-amount" />
            </p>
          ))}
          <p className="ins-next-title">מה עכשיו?</p>
          <p>
            <Rich text={insight.detail.next} className="ins-amount" />
          </p>
          <button className="btn" type="button" onClick={onClose}>
            הבנתי, תודה
          </button>
          <hr className="ins-rule" />
          {answer === null ? (
            <>
              <p className="ins-ask">זה עזר לך?</p>
              <div className="ins-answers">
                <button type="button" className="ins-answer" onClick={() => onAnswer(true)}>
                  <span>כן!</span>
                  <CoinFace happy />
                </button>
                <button type="button" className="ins-answer" onClick={() => onAnswer(false)}>
                  <span>לא</span>
                  <CoinFace happy={false} />
                </button>
              </div>
            </>
          ) : (
            <p className="ins-thanks">
              תודה!{' '}
              <span aria-hidden="true">
                <Heart size={18} />
              </span>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
