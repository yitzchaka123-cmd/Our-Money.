'use client';

import { useState, useTransition } from 'react';

import { Pencil } from '@/app/dashboard/components/icons-extra';
import { setAccountLabel } from '@/lib/dashboard/account-actions';

/**
 * The foot of an account card: the couple's own name for the card or account
 * (where RiseUp shows the number it never sends us), editable in place.
 */
export function AccountNameEditor({
  source,
  hash,
  label,
  kind,
}: {
  source: string;
  hash: string;
  label: string | null;
  kind: 'card' | 'bank' | 'unknown';
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const example = kind === 'bank' ? 'למשל: עו״ש משותף' : 'למשל: כרטיס 0848';

  const save = () =>
    start(async () => {
      setError(null);
      const result = await setAccountLabel(source, hash, value);
      if (result.ok) setEditing(false);
      else setError(result.error);
    });

  if (!editing) {
    return (
      <button type="button" className="account-foot account-name-btn" onClick={() => setEditing(true)}>
        <span className={label ? 'account-name' : 'account-name is-empty'}>
          {label ?? (kind === 'bank' ? 'לתת שם לחשבון' : 'לתת שם לכרטיס')}
        </span>
        <span className="account-name-edit" aria-hidden="true">
          <Pencil size={18} />
        </span>
      </button>
    );
  }

  return (
    <div className="account-foot account-name-form">
      <input
        type="text"
        value={value}
        maxLength={40}
        autoFocus
        placeholder={example}
        aria-label="השם שלכם לחשבון"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <button type="button" className="btn-inline" disabled={pending} onClick={save}>
        שמירה
      </button>
      {error ? <p className="form-error account-name-error">{error}</p> : null}
    </div>
  );
}
