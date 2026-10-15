'use client';

import { useState, useTransition } from 'react';

import { Cards } from '@/app/dashboard/components/icons-extra';
import { setBriefEnabled } from '@/lib/dashboard/brief-actions';

/**
 * Settings → "הסיכום היומי": one switch that hides the daily brief — the green
 * blob, its deck of cards and the drawer's link — for whoever is signed in.
 */
export function BriefToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const flip = () => {
    const next = !on;
    setOn(next);
    setError(null);
    start(async () => {
      const result = await setBriefEnabled(next);
      if (!result.ok) {
        setOn(!next);
        setError(result.error);
      }
    });
  };

  return (
    <>
      <div className="settings-row settings-row--static">
        <span className="settings-ico">
          <Cards />
        </span>
        <span className="settings-row-text">
          <span className="settings-row-title" id="brief-toggle-label">
            הסיכום היומי
          </span>
          <span className="settings-row-sub">הבועה הירוקה וכרטיס לכל חיוב חדש</span>
        </span>
        <button
          type="button"
          role="switch"
          className="brief-switch"
          aria-checked={on}
          aria-labelledby="brief-toggle-label"
          disabled={pending}
          onClick={flip}
        >
          <span className="brief-switch-knob" />
        </button>
      </div>
      {error ? <p className="settings-name-error">{error}</p> : null}
    </>
  );
}
