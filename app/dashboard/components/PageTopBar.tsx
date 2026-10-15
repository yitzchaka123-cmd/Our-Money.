'use client';

import { SyncButton, SyncLine, SyncProvider } from '@/app/dashboard/components/SyncButton';
import { ChevronRight, SparkleBubble } from '@/app/dashboard/components/icons';

/**
 * The top bar of the pages behind the drawer (accounts, settings): the back
 * arrow, and the same sync button the dashboard has, in the same place
 * (feedback video 2, item 3), with the "עודכן לפני…" line under it (item 15).
 */
export function PageTopBar({
  backHref = '/dashboard',
  lastSyncAt,
}: {
  backHref?: string;
  /** The last successful pull from RiseUp, ISO. */
  lastSyncAt: string | null;
}) {
  return (
    <SyncProvider lastSyncAt={lastSyncAt}>
      <header className="appbar">
        <div className="appbar-actions">
          <a className="icon-btn" href={backHref} aria-label="חזרה">
            <ChevronRight />
          </a>
          <SyncButton />
        </div>
        <span className="icon-btn" aria-hidden="true">
          <SparkleBubble />
        </span>
      </header>
      <SyncLine page />
    </SyncProvider>
  );
}
