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
 *   npx tsx scripts/preview-dashboard.tsx out.html txn-note           (a RiseUp charge with our note)
 *   npx tsx scripts/preview-dashboard.tsx out.html note-sheet         (editing that note)
 */

import type { ReactNode } from 'react';

import { AssistantSheet } from '../app/dashboard/components/AssistantSheet';
import { RiseupNoteSheet } from '../app/dashboard/components/RiseupNoteSheet';
import { SetupStepsSheet } from '../app/dashboard/components/SetupSteps';
import { TransactionSheet } from '../app/dashboard/components/TransactionSheet';
import { setupSteps } from '../lib/dashboard/steps';
import type { NormalizedActual } from '../lib/riseup/envelopes';

const NOTED: NormalizedActual = {
  transactionId: 't-delpasto',
  transactionDate: '2026-10-14',
  billingDate: '2026-10-14',
  businessName: 'דל פסטו',
  amountIls: 42,
  isIncome: false,
  accountNickname: null,
  accountNumberHash: 'cc5910',
  accountName: 'כרטיס 0848',
  source: 'leumicard',
  isInstallment: false,
  paymentNumber: null,
  totalPayments: null,
  categoryLabel: 'אוכל בחוץ',
  note: 'שניצל לארוחת ערב',
};

export function previewOverlay(mode: string | undefined): ReactNode {
  switch (mode) {
    case 'txn-note':
      return (
        <TransactionSheet
          open
          onClose={() => {}}
          transaction={{ actual: NOTED, envelopeTitle: 'אוכל בחוץ', envelopeType: 'trackingCategory', envelopeId: 'e-food' }}
          walletName={null}
          onCashAction={() => {}}
          onEditCash={() => {}}
          onSavings={() => {}}
          onDeleteCash={() => {}}
        />
      );
    case 'note-sheet':
      return <RiseupNoteSheet actual={NOTED} month="2026-10" onClose={() => {}} />;
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
