import { cookies } from 'next/headers';

import { SettingsView } from '@/app/settings/SettingsView';
import './telegram-settings.css';
import { SignedOut } from '@/app/SignedOut';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { loadAccountSummaries } from '@/lib/dashboard/account-summaries';
import { currentMonth } from '@/lib/dashboard/data';
import { db } from '@/lib/db/client';
import { loadSyncState } from '@/lib/riseup/sync';
import { confirmModeOf, nudgeFrequencyOf } from '@/lib/telegram/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MemberRow {
  id: string;
  display_name: string;
  preferred_name?: string | null;
  is_active: boolean;
  nudge_frequency?: string | null;
  bot_confirm_mode?: string | null;
}

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;
  if (!session) return <SignedOut />;

  const month = currentMonth();
  const [{ data: memberRows }, accounts, syncState] = await Promise.all([
    // select('*'): preferred_name arrives with migration 0004/0005; until then it is simply absent.
    db().from('household_members').select('*').order('created_at'),
    loadAccountSummaries(month),
    loadSyncState(),
  ]);
  const members = ((memberRows ?? []) as MemberRow[]).filter((m) => m.is_active);
  const me = members.find((m) => m.id === session.memberId);

  return (
    <SettingsView
      data={{
        preferredName: me?.preferred_name?.trim() || null,
        telegramName: me?.display_name ?? '',
        members: members.map((m) => ({
          id: m.id,
          name: m.preferred_name?.trim() || m.display_name,
          telegramName: m.display_name,
          isYou: m.id === session.memberId,
        })),
        accounts: accounts.map((a) => ({
          key: a.key,
          name: a.displayName,
          provider: a.provider,
          kind: a.kind,
          named: Boolean(a.label),
        })),
        telegram: {
          members: members.map((m) => ({
            id: m.id,
            name: m.preferred_name?.trim() || m.display_name,
            isYou: m.id === session.memberId,
            nudge: nudgeFrequencyOf(m),
            confirm: confirmModeOf(m),
          })),
        },
        lastSync: formatStamp(syncState.lastSuccessAt),
        month,
        yearAgo: monthsBefore(month, 12),
      }}
    />
  );
}

function formatStamp(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(',', '');
}

function monthsBefore(month: string, count: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year!, monthNumber! - 1 - count, 1)).toISOString().slice(0, 7);
}
