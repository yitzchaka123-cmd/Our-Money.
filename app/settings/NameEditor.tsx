'use client';

import { useState, useTransition } from 'react';

import { Pencil } from '@/app/dashboard/components/icons-extra';
import { setPreferredName } from '@/lib/profile/actions';

/** RiseUp's "עריכת פרטים" pill, for the one detail that is ours to edit: your name. */
export function NameEditor({ name }: { name: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      const result = await setPreferredName(value);
      if (result.ok) setEditing(false);
      else setError(result.error);
    });

  if (!editing) {
    return (
      <button type="button" className="settings-edit-pill" onClick={() => setEditing(true)}>
        <Pencil size={16} />
        {name ? 'עריכת השם' : 'איך לקרוא לך?'}
      </button>
    );
  }

  return (
    <div className="settings-name-form">
      <input
        type="text"
        value={value}
        maxLength={40}
        autoFocus
        placeholder="השם שלך"
        aria-label="השם שלך"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <button type="button" className="settings-save" disabled={pending} onClick={save}>
        שמירה
      </button>
      {error ? <p className="settings-name-error">{error}</p> : null}
    </div>
  );
}
