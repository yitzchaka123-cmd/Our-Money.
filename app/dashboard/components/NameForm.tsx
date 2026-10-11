'use client';

import { useState, useTransition, type FormEvent } from 'react';

import { setPreferredName } from '@/lib/profile/actions';
import { PREFERRED_NAME_MAX } from '@/lib/profile/names';

/**
 * "איך לקרוא לך?" — a name field and a save button. Saving an empty field
 * clears the name, and the greeting goes back to just "היי".
 */
export function NameForm({
  initial,
  onSaved,
}: {
  initial: string | null;
  onSaved?: (name: string | null) => void;
}) {
  const [value, setValue] = useState(initial ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await setPreferredName(value);
      if (result.ok) onSaved?.(result.name);
      else setError(result.error);
    });
  };

  return (
    <form className="name-form" onSubmit={submit}>
      <label className="field">
        <span>השם שלך</span>
        <input
          type="text"
          name="preferred_name"
          autoComplete="given-name"
          placeholder="למשל: יצחק"
          maxLength={PREFERRED_NAME_MAX}
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? 'שומר…' : 'שמירה'}
      </button>
    </form>
  );
}
