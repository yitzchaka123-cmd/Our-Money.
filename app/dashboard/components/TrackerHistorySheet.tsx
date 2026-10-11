'use client';

import { useEffect, useState } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { ChevronUpDown } from '@/app/dashboard/components/icons-extra';
import { Popup } from '@/app/dashboard/components/Popup';
import { envelopeHistory, type HistoryPoint } from '@/lib/dashboard/actions';
import type { EnvelopeView } from '@/lib/dashboard/data';
import { formatAmount, monthParts } from '@/lib/money';

const SHORT_MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];

export function shortMonth(month: string): string {
  return SHORT_MONTHS[Number(month.slice(5, 7)) - 1] ?? month;
}

export interface Bar {
  month: string;
  /** What was spent (or came in). */
  value: number;
  /** The current month: drawn as an outline at its target, filled to `value`. */
  target?: number;
}

/**
 * RiseUp's month chart: oldest on the right, this month on the left (RTL),
 * the figure above each bar, the short month name under it. Past months are
 * solid tint; this month is an outline at its target with what was spent so
 * far inside it.
 */
export function MonthBars({ bars, tone }: { bars: Bar[]; tone: 'tracking' | 'income' }) {
  const peak = Math.max(1, ...bars.map((b) => Math.max(b.value, b.target ?? 0)));
  const HEIGHT = 140;
  const h = (v: number) => Math.max(Math.round((v / peak) * HEIGHT), 10);
  return (
    <div className="month-bars" data-tone={tone}>
      {bars.map((bar) => {
        const current = bar.target !== undefined;
        const shown = current ? bar.target! : bar.value;
        return (
          <div key={bar.month} className="month-bar" data-current={current}>
            <span className="month-bar-value">{Math.round(shown).toLocaleString('en-US')}</span>
            <span className="month-bar-col" style={{ height: h(shown) }}>
              {current && bar.value > 0 ? (
                <span className="month-bar-fill" style={{ height: `${Math.min(bar.value / Math.max(shown, 1), 1) * 100}%` }} />
              ) : null}
            </span>
            <span className="month-bar-label">{shortMonth(bar.month)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Five months for the chart: the history's past months, then this month live. */
export function barsFrom(points: HistoryPoint[], envelope: EnvelopeView, month: string): Bar[] {
  const past = points.filter((p) => p.month < month).slice(-4).map((p) => ({ month: p.month, value: p.actual }));
  return [...past, { month, value: envelope.actual, target: envelope.expected }];
}

/** One short line saying what we changed on our side, or null. */
export function oursLine(envelope: EnvelopeView): string | null {
  const o = envelope.override;
  if (!o) return null;
  if (o.custom) return 'הקטגוריה הזאת נשמרת אצלנו בלבד — ברייזאפ היא לא מופיעה.';
  const was = o.riseupTarget !== null ? ` (שם: ${formatAmount(o.riseupTarget, 0)})` : '';
  if (envelope.type === 'variableIncome') return `הצפי נשמר אצלנו בלבד — ברייזאפ הוא לא השתנה${was}.`;
  if (o.retargeted && o.renamed) return 'הסכום והשם נשמרו אצלנו בלבד — ברייזאפ הם לא השתנו.';
  if (o.retargeted) return `הסכום נשמר אצלנו בלבד — ברייזאפ הוא לא השתנה${was}.`;
  if (o.renamed) return `השם נשמר אצלנו בלבד — ברייזאפ השם הוא ${o.riseupName}.`;
  return null;
}

/**
 * The tracker's (or income's) "חודשים קודמים": a popup with the last five
 * months as bars, this month's target, why the category is here, and a way
 * to change the target.
 */
export function TrackerHistorySheet({
  envelope,
  month,
  onClose,
  onEditTarget,
  initialPoints = null,
}: {
  envelope: EnvelopeView;
  month: string;
  onClose: () => void;
  onEditTarget: () => void;
  /** Preview only: skip the server round-trip. */
  initialPoints?: HistoryPoint[] | null;
}) {
  const [points, setPoints] = useState<HistoryPoint[] | null>(initialPoints);
  const [error, setError] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(true);
  const income = envelope.type === 'variableIncome';
  const label = envelope.override?.categoryLabel ?? envelope.title;

  useEffect(() => {
    if (initialPoints) return;
    let live = true;
    envelopeHistory(month, envelope.type, envelope.title, 5, envelope.trackerKey ?? null, income ? null : label).then((result) => {
      if (!live) return;
      if (result.ok) setPoints(result.data);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [month, envelope.type, envelope.title, envelope.trackerKey, income, label, initialPoints]);

  const monthName = monthParts(month).name;
  const ours = oursLine(envelope);

  return (
    <Popup
      onClose={onClose}
      labelledBy="tracker-history-title"
      title={income ? 'הכנסות לפי חודשים' : `הוצאות ${envelope.title} לפי חודשים`}
      footer={
        <button className="popup-link" type="button" onClick={onClose}>
          הבנתי, תודה
        </button>
      }
    >
      <div className="bars-card">
        {points ? (
          <MonthBars bars={barsFrom(points, envelope, month)} tone={income ? 'income' : 'tracking'} />
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : (
          <div className="month-bars is-loading" aria-label="טוען">
            {[50, 80, 30, 100, 60].map((height, i) => (
              <div key={i} className="month-bar">
                <span className="month-bar-col" style={{ height }} />
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="target-line">
        {income ? `ההכנסה הצפויה לחודש ${monthName} היא: ` : `היעד שנקבע לחודש ${monthName} הוא: `}
        <strong>
          <Amount value={envelope.expected} decimals={0} />
        </strong>
      </p>
      {ours ? <p className="ours-line">{ours}</p> : null}

      <button className="why-toggle" type="button" aria-expanded={whyOpen} onClick={() => setWhyOpen((v) => !v)}>
        <span>{income ? 'מה נחשב כאן?' : 'למה הקטגוריה מופיעה אצלך?'}</span>
        <ChevronUpDown open={whyOpen} />
      </button>
      {whyOpen ? (
        <p className="why-text">
          {income
            ? 'אלה ההכנסות שרייזאפ זיהתה בחשבון החודש. אם ידוע לך על הכנסה שעוד תגיע, אפשר לעדכן את הצפי כאן — הוא נשמר אצלנו בלבד, ובסוף החודש התזרים מתעדכן לפי מה שנכנס בפועל.'
            : envelope.override?.custom
              ? `הוספתם את הקטגוריה הזאת למעקב כאן, אצלנו. היא אוספת את ההוצאות המשתנות שמסומנות ${label}, והיעד שלה נלקח מתקציב ההוצאות המשתנות. ברייזאפ היא לא מופיעה.`
              : 'זאת קטגוריה שבחרת לעקוב אחריה ברייזאפ וקבעת לה יעד. אפשר להעביר אליה הוצאות שמתאימות לה מקטגוריות אחרות.'}
        </p>
      ) : null}

      <button className="btn" type="button" onClick={onEditTarget}>
        {income ? 'לעדכון הצפי' : 'לעריכת היעד'}
      </button>
    </Popup>
  );
}
