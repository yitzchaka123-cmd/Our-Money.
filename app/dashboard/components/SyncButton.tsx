'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { Sync } from '@/app/dashboard/components/topbar-icons';
import { useRiseupSync } from '@/app/dashboard/components/useRiseupSync';
import { syncedAgoLabel } from '@/lib/riseup/synced-ago';

/** How long a sync's result stays in the line: a failure needs longer to read. */
const HOLD_MS = { ok: 3500, error: 9000 };
/** How often "לפני 5 דק׳" moves on. */
const TICK_MS = 30_000;

type SyncState = ReturnType<typeof useRiseupSync> & { lastSyncAt: string | null };

const SyncContext = createContext<SyncState | null>(null);

/**
 * One sync state for a page's top bar: the sync icon starts it, and the
 * "עודכן לפני…" line under the bar shows its progress and result (feedback
 * video 2, item 15 — no bubble over the month name any more).
 */
export function SyncProvider({ lastSyncAt, children }: { lastSyncAt: string | null; children: ReactNode }) {
  const sync = useRiseupSync(HOLD_MS);
  // Whichever is newer: the page's data, or a sync tapped on this page.
  const latest =
    lastSyncAt && sync.syncedAt
      ? Date.parse(sync.syncedAt) > Date.parse(lastSyncAt)
        ? sync.syncedAt
        : lastSyncAt
      : (lastSyncAt ?? sync.syncedAt);
  return <SyncContext.Provider value={{ ...sync, lastSyncAt: latest }}>{children}</SyncContext.Provider>;
}

function useSync(): SyncState {
  const shared = useContext(SyncContext);
  const own = useRiseupSync(HOLD_MS);
  return shared ?? { ...own, lastSyncAt: own.syncedAt };
}

/** The top bar's sync icon: pulls from RiseUp now and spins while it does. */
export function SyncButton() {
  const { pending, run } = useSync();

  return (
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
  );
}

/** The current time, moving on every half minute and when the app comes back to the front. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return now;
}

/**
 * Always on screen, under the top bar: when RiseUp was last pulled, and —
 * for a few seconds after a tap on sync — how that went.
 */
export function SyncLine({ page = false }: { page?: boolean }) {
  const { pending, feedback, dismiss, lastSyncAt } = useSync();
  const now = useNow();
  const text = pending ? 'מסנכרן מרייזאפ…' : feedback ? feedback.text : syncedAgoLabel(lastSyncAt, now);
  const tone = !pending && feedback?.tone === 'error' ? 'error' : undefined;

  return (
    <p
      className={page ? 'sync-line sync-line--page' : 'sync-line'}
      data-tone={tone}
      role="status"
      aria-live="polite"
      onClick={feedback ? dismiss : undefined}
      // The server's clock and the phone's can differ by a minute.
      suppressHydrationWarning
    >
      {text}
    </p>
  );
}
