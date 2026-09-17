'use client';

import { useState, useTransition } from 'react';

import { refreshFromRiseup } from '@/lib/cash/actions';

/** Pulls from RiseUp now. Used in the drawer and beside the "last synced" line. */
export function RefreshButton({ className = 'btn-inline' }: { className?: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const run = () =>
    start(async () => {
      setMessage(null);
      const result = await refreshFromRiseup();
      setMessage(result.ok ? 'עודכן מרייזאפ ✓' : `הסנכרון נכשל: ${result.error}`);
    });

  return (
    <span className="refresh">
      <button className={className} type="button" disabled={pending} onClick={run}>
        {pending ? 'מסנכרן…' : 'עדכון מרייזאפ'}
      </button>
      {message ? <span className="refresh-msg">{message}</span> : null}
    </span>
  );
}
