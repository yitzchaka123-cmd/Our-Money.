'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { refreshFromRiseup } from '@/lib/cash/actions';
import { syncFeedback, type SyncFeedback } from '@/lib/riseup/sync-feedback';

/**
 * "Pull from RiseUp now", shared by the top bar's sync icon, the drawer row,
 * the sync banner and the setup checklist. The action revalidates the
 * dashboard itself, so the new numbers arrive without a reload.
 *
 * `holdMs` clears the message again after a while (null keeps it).
 */
export function useRiseupSync(holdMs: { ok: number; error: number } | null = null) {
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<SyncFeedback | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const run = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setFeedback(null);
    start(async () => {
      let next: SyncFeedback;
      try {
        next = syncFeedback(await refreshFromRiseup());
      } catch {
        next = { tone: 'error', text: 'אין חיבור כרגע. בדקו את האינטרנט ונסו שוב.' };
      }
      setFeedback(next);
      if (holdMs) timer.current = setTimeout(() => setFeedback(null), holdMs[next.tone]);
    });
  }, [holdMs]);

  return { pending, feedback, run, dismiss: () => setFeedback(null) };
}
