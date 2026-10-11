'use client';

import { Sync } from '@/app/dashboard/components/topbar-icons';
import { useRiseupSync } from '@/app/dashboard/components/useRiseupSync';

/** How long the line under the top bar stays: a failure needs longer to read. */
const HOLD_MS = { ok: 3500, error: 9000 };

/**
 * The top bar's sync icon: pulls from RiseUp now, spins while it does, then
 * says in one short line that it finished — or why it did not.
 */
export function SyncButton() {
  const { pending, feedback, run, dismiss } = useRiseupSync(HOLD_MS);

  return (
    <>
      <button
        className="icon-btn sync-btn"
        type="button"
        aria-label={pending ? 'מסנכרן מ-RiseUp…' : 'סנכרון מ-RiseUp'}
        aria-busy={pending}
        disabled={pending}
        onClick={run}
      >
        <Sync className={pending ? 'is-spinning' : undefined} />
      </button>
      {feedback ? (
        <button
          type="button"
          className="sync-toast"
          data-tone={feedback.tone}
          role="status"
          onClick={dismiss}
        >
          {feedback.text}
        </button>
      ) : null}
    </>
  );
}
