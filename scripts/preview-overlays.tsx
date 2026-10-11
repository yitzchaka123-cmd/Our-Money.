/**
 * Preview modes that draw something over the dashboard, for screenshots:
 *
 *   npx tsx scripts/preview-dashboard.tsx out.html sync-toast
 *   npx tsx scripts/preview-dashboard.tsx out.html sync-error
 */

import type { ReactNode } from 'react';

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
    default:
      return null;
  }
}
