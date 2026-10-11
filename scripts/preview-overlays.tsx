/**
 * Preview modes that draw something over the dashboard, for screenshots:
 *
 *   npx tsx scripts/preview-dashboard.tsx out.html sync-toast
 *   npx tsx scripts/preview-dashboard.tsx out.html sync-error
 *   npx tsx scripts/preview-dashboard.tsx out.html steps
 */

import type { ReactNode } from 'react';

import { SetupStepsSheet } from '../app/dashboard/components/SetupSteps';
import { setupSteps } from '../lib/dashboard/steps';

export function previewOverlay(mode: string | undefined): ReactNode {
  switch (mode) {
    case 'sync-toast':
      return (
        <div className="sync-toast" role="status">
          סונכרן עכשיו
        </div>
      );
    case 'sync-error':
      return (
        <div className="sync-toast" data-tone="error" role="status">
          הטוקן של RiseUp פג תוקף. צריך ליצור חדש ולעדכן אותו.
        </div>
      );
    case 'steps':
      return (
        <SetupStepsSheet
          open
          steps={setupSteps({ lastSyncAt: '2026-10-11T07:36:00Z', telegramLinked: true, preferredName: null, walletBalanceSet: false })}
          preferredName={null}
          onClose={() => {}}
        />
      );
    default:
      return null;
  }
}
