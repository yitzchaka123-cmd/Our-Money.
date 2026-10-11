'use client';

import { useRiseupSync } from '@/app/dashboard/components/useRiseupSync';

/** Pulls from RiseUp now. Used in the drawer and beside the "last synced" line. */
export function RefreshButton({ className = 'btn-inline' }: { className?: string }) {
  const { pending, feedback, run } = useRiseupSync();

  return (
    <span className="refresh">
      <button className={className} type="button" disabled={pending} onClick={run}>
        {pending ? 'מסנכרן…' : 'עדכון מרייזאפ'}
      </button>
      {feedback ? <span className="refresh-msg">{feedback.text}</span> : null}
    </span>
  );
}
