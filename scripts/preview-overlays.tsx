/**
 * Preview modes that draw something over the dashboard, for screenshots:
 *
 *   npx tsx scripts/preview-dashboard.tsx out.html sync-toast
 *   npx tsx scripts/preview-dashboard.tsx out.html sync-error
 *   npx tsx scripts/preview-dashboard.tsx out.html steps
 *   npx tsx scripts/preview-dashboard.tsx out.html assistant          (empty)
 *   npx tsx scripts/preview-dashboard.tsx out.html assistant-chat     (a mocked conversation)
 *   npx tsx scripts/preview-dashboard.tsx out.html assistant-pending  ("אני על זה...")
 *   npx tsx scripts/preview-dashboard.tsx out.html assistant-history
 */

import type { ReactNode } from 'react';

import { AssistantSheet } from '../app/dashboard/components/AssistantSheet';
import { SetupStepsSheet } from '../app/dashboard/components/SetupSteps';
import { setupSteps } from '../lib/dashboard/steps';

export function previewOverlay(mode: string | undefined): ReactNode {
  switch (mode) {
    // A sync's result is said in the line under the month bar (no bubble):
    // these draw that line, in place, as it reads right after a tap.
    case 'sync-toast':
      return (
        <p className="sync-line" role="status" style={{ position: 'fixed', top: 116, insetInline: 0 }}>
          סונכרן עכשיו
        </p>
      );
    case 'sync-error':
      return (
        <p className="sync-line" data-tone="error" role="status" style={{ position: 'fixed', top: 116, insetInline: 0 }}>
          הטוקן של RiseUp פג תוקף. צריך ליצור חדש ולעדכן אותו.
        </p>
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
    case 'assistant':
      return <AssistantSheet open onClose={() => {}} />;
    case 'assistant-chat':
      return (
        <AssistantSheet
          open
          onClose={() => {}}
          preview={{
            turns: [
              { role: 'user', content: 'כמה הוצאנו על אוכל בחוץ החודש?' },
              {
                role: 'assistant',
                content:
                  'החודש הוצאתם **194 ₪** על אוכל בחוץ — 74 ₪ בכרטיס במסעדת הגליל ו-120 ₪ במזומן על ארוחת צהריים. היעד הוא 500 ₪, אז נשארו **306 ₪**.',
              },
              { role: 'user', content: 'איך החודש נראה מול הקודם?' },
              {
                role: 'assistant',
                content:
                  'עד עכשיו יצאו **4,608 ₪**, לעומת 5,120 ₪ בכל אוגוסט.\n\n- הוצאות משתנות: 291 ₪ (באוגוסט 1,340 ₪)\n- הוצאות קבועות: 3,077 ₪ (באוגוסט 3,120 ₪)\n\nהתחזית לסוף החודש: **-8,478 ₪**.',
              },
            ],
          }}
        />
      );
    case 'assistant-pending':
      return (
        <AssistantSheet open onClose={() => {}} preview={{ turns: [], pending: 'כמה מזומן יש לנו עכשיו?' }} />
      );
    case 'assistant-history':
      return (
        <AssistantSheet
          open
          onClose={() => {}}
          preview={{
            view: 'history',
            chats: [
              { id: 'a', title: 'כמה הוצאנו על אוכל בחוץ החודש?', updatedAt: '2026-10-11T09:12:00Z' },
              { id: 'b', title: 'כמה מזומן יש לנו עכשיו?', updatedAt: '2026-10-09T18:40:00Z' },
              { id: 'c', title: 'איך החודש נראה מול הקודם?', updatedAt: '2026-10-02T07:05:00Z' },
            ],
          }}
        />
      );
    default:
      return null;
  }
}
