'use client';

import type { ReactNode } from 'react';

import { Amount } from '@/app/dashboard/components/Amount';
import { Sheet } from '@/app/dashboard/components/Sheet';
import type { ForecastBreakdown } from '@/lib/dashboard/forecast-breakdown';

type Hue = 'income' | 'fixed' | 'tracking' | 'variable' | 'goal' | 'cash';

function Line({ hue, label, sub, value }: { hue: Hue; label: string; sub?: ReactNode; value: number }) {
  return (
    <li className="forecast-line">
      <span className="forecast-dot" data-hue={hue} aria-hidden="true" />
      <span className="forecast-label">
        <span>{label}</span>
        {sub ? <span className="forecast-sub">{sub}</span> : null}
      </span>
      <Amount value={value} decimals={0} className="forecast-figure" />
    </li>
  );
}

/**
 * "איך חישבנו את הצפי?" — opened from the forecast card's ⋮. The lines are
 * the same numbers the forecast is built from, and add up to it.
 */
export function ForecastSheet({
  open,
  onClose,
  monthName,
  breakdown: b,
}: {
  open: boolean;
  onClose: () => void;
  monthName: string;
  breakdown: ForecastBreakdown;
}) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="forecast-title">
      <div className="sheet-body">
        <h2 className="sheet-title" id="forecast-title">איך חישבנו את הצפי?</h2>
        <p className="forecast-intro">
          ההכנסות הצפויות פחות ההוצאות הצפויות. בכל קטגוריה ספרנו את מה שתכננתם, ואם כבר יצא יותר — את מה שיצא.
        </p>

        <ul className="forecast-lines">
          <Line hue="income" label="הכנסות צפויות" value={b.incomeExpected} />
          {b.fixedIncomeExpected !== 0 ? (
            <Line hue="income" label="הכנסות קבועות" sub="כמו משכורת שסימנתם ברייזאפ כהכנסה קבועה" value={b.fixedIncomeExpected} />
          ) : null}
          <Line hue="cash" label="הכנסות במזומן" sub="מה שנכנס ומה שעוד צפוי להיכנס" value={b.cashIn} />
          <Line hue="fixed" label="הוצאות קבועות צפויות" value={-b.fixedExpected} />
          <Line hue="tracking" label="הוצאות במעקב צפויות" value={-b.trackersExpected} />
          <Line
            hue="variable"
            label="הוצאות משתנות"
            sub={
              <>
                הוצאתם עד עכשיו <Amount value={b.variableSpent} decimals={0} />
              </>
            }
            value={-b.variableExpected}
          />
          {b.savingsExpected !== 0 ? <Line hue="goal" label="חיסכון" value={-b.savingsExpected} /> : null}
        </ul>

        <div className={b.forecast < 0 ? 'forecast-total is-negative' : 'forecast-total'}>
          <span>הצפי לסוף {monthName}</span>
          <Amount value={b.forecast} decimals={0} className="forecast-figure" />
        </div>

        <p className="forecast-cash">
          מזומן שיצא ושעוד צפוי לצאת החודש: <Amount value={b.cashOut} decimals={0} />. הוא כבר כלול בהוצאות למעלה.
        </p>

        <button className="btn forecast-done" type="button" onClick={onClose}>
          הבנתי
        </button>
      </div>
    </Sheet>
  );
}
