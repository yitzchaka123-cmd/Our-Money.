'use client';

import { useState } from 'react';

import { Info } from '@/app/dashboard/components/icons-extra';
import { Sheet } from '@/app/dashboard/components/Sheet';
import type { AccountOption } from '@/lib/dashboard/account-filter';

/**
 * RiseUp's filter screen, "חשבונות להצגה": one round tick per card and
 * account (and cash), plus "all". Nothing changes until "הצגה".
 */
export function AccountFilterSheet({
  accounts,
  hidden,
  onApply,
  onClose,
}: {
  accounts: AccountOption[];
  hidden: ReadonlySet<string>;
  onApply: (hidden: Set<string>) => void;
  onClose: () => void;
}) {
  // Accounts missing this month keep whatever was chosen for them.
  const [draft, setDraft] = useState<Set<string>>(() => new Set(hidden));
  const allShown = accounts.every((a) => !draft.has(a.key));
  const noneShown = accounts.every((a) => draft.has(a.key));

  const toggle = (key: string) =>
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Sheet open onClose={onClose} labelledBy="filter-title">
      <div className="sheet-body filter-sheet">
        <h2 className="sheet-title" id="filter-title">חשבונות להצגה:</h2>
        <label className="filter-row filter-row--all">
          <input
            type="checkbox"
            className="round-check"
            checked={allShown}
            onChange={() =>
              setDraft((current) => {
                const next = new Set(current);
                for (const a of accounts) {
                  if (allShown) next.add(a.key);
                  else next.delete(a.key);
                }
                return next;
              })
            }
          />
          <span>כל החשבונות והכרטיסים</span>
        </label>
        <div className="filter-list">
          {accounts.map((account) => (
            <label key={account.key} className="filter-row">
              <input type="checkbox" className="round-check" checked={!draft.has(account.key)} onChange={() => toggle(account.key)} />
              <span>{account.label}</span>
            </label>
          ))}
        </div>
        <div className="tip-box">
          <Info />
          <p>
            רוצה לתת כינוי לכל כרטיס וחשבון? אפשר דרך <a href="/accounts">עמוד החשבונות</a>.
          </p>
        </div>
        {noneShown ? <p className="form-error">צריך להשאיר לפחות חשבון אחד.</p> : null}
        <button
          className="btn"
          type="button"
          disabled={noneShown}
          onClick={() => {
            onApply(draft);
            onClose();
          }}
        >
          הצגה
        </button>
      </div>
    </Sheet>
  );
}
