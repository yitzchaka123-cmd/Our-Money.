import { cookies } from 'next/headers';

import { SignedOut } from '@/app/SignedOut';
import { DailyList } from '@/app/daily/DailyList';
import { ChevronRight, Heart, SparkleBubble } from '@/app/dashboard/components/icons';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { envelopeChoices, type EnvelopeRef } from '@/lib/cash/envelopes';
import type { WalletSummary } from '@/lib/dashboard/data';
import { db } from '@/lib/db/client';
import { isoDateInIsrael } from '@/lib/dates';
import { ENVELOPE_TITLES } from '@/lib/riseup/envelopes';
import type { CashSpend, CashWallet, EnvelopeType } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The counterpart to RiseUp's daily brief: the cash entries the AI intake was
 * unsure about, so they can be confirmed in one pass instead of one bot message
 * at a time.
 */
export default async function DailyPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token || !verifySessionToken(token)) return <SignedOut />;

  const supabase = db();
  const today = isoDateInIsrael();
  const [{ data: pending }, { data: recent }, { data: members }, { data: envelopeRows }, { data: walletRows }] = await Promise.all([
    supabase
      .from('cash_spends')
      .select('*')
      .eq('status', 'needs_review')
      .order('created_at', { ascending: false }),
    supabase
      .from('cash_spends')
      .select('*')
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(15),
    supabase.from('household_members').select('id, display_name'),
    supabase.from('riseup_envelopes').select('envelope_id, envelope_type, name').eq('month', today.slice(0, 7)),
    supabase.from('cash_wallets').select('*').eq('is_archived', false).order('position'),
  ]);

  const memberList = (members ?? []) as { id: string; display_name: string }[];
  const toReview = (pending ?? []) as CashSpend[];
  const refs: EnvelopeRef[] = (envelopeRows ?? []).map((row) => ({
    envelopeId: row.envelope_id as string,
    type: row.envelope_type as EnvelopeType,
    name: (row.name as string | null) ?? ENVELOPE_TITLES[row.envelope_type as EnvelopeType] ?? '',
  }));
  const wallets: WalletSummary[] = ((walletRows ?? []) as CashWallet[]).map((w) => ({
    id: w.id,
    name: w.name,
    balance: 0,
    isDefault: w.is_default,
    memberName: null,
  }));

  return (
    <div className="app">
      <header className="appbar">
        <a className="icon-btn" href="/dashboard" aria-label="חזרה">
          <ChevronRight />
        </a>
        <span className="icon-btn" aria-hidden="true">
          <SparkleBubble />
        </span>
      </header>

      <h1 className="page-title">המזומן היומי</h1>

      {toReview.length === 0 ? (
        <div className="tip">
          <p className="tip-title">
            <span style={{ color: 'var(--primary)' }}>
              <Heart />
            </span>
            הכול מאושר
          </p>
          <p style={{ margin: 0 }}>אין רישומים שממתינים לאישור. אפשר להמשיך לרשום בבוט.</p>
        </div>
      ) : (
        <div className="tip">
          <p className="tip-title">
            <span style={{ color: 'var(--primary)' }}>
              <Heart />
            </span>
            {toReview.length} רישומים לאישור
          </p>
          <p style={{ margin: 0 }}>לא הייתי בטוח בסכום או בקטגוריה. אשרו, תקנו או מחקו — כאן או בבוט.</p>
        </div>
      )}

      <DailyList
        toReview={toReview}
        recent={(recent ?? []) as CashSpend[]}
        members={memberList}
        envelopes={envelopeChoices(refs)}
        wallets={wallets}
        today={today}
      />
    </div>
  );
}
