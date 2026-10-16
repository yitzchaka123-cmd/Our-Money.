import { loadBotEnvelopes } from '@/lib/intake/categories';
import { envelopeOfSpend } from '@/lib/intake/envelopes';
import { isoDateInIsrael } from '@/lib/dates';
import { db } from '@/lib/db/client';
import { formatIls, friendlyDate } from '@/lib/money';
import { memberName } from '@/lib/profile/names';
import { escapeHtml, sendMessage } from '@/lib/telegram/client';
import { familyGroupChatId } from '@/lib/telegram/group';

/**
 * Tell the family group about cash news (feedback video 4 #3: "so she can
 * also see what I updated"): who, how much, which envelope. Nothing is said
 * in the group about what happened in the group itself — everyone saw it.
 * A failure here never undoes or blocks the entry; it is only logged.
 */
export async function announceToFamily(text: string, happenedInChatId: number | null = null): Promise<void> {
  try {
    const group = await familyGroupChatId();
    if (group === null || group === happenedInChatId) return;
    await sendMessage(group, text);
  } catch (error) {
    console.error('Could not tell the family group', error);
  }
}

/** One line about an entry, in the bot's usual shape. */
export function entryLine(amountIls: number, label: string | null, note: string | null, date: string, today = isoDateInIsrael()): string {
  return `• <b>${formatIls(amountIls)}</b>${label ? ` · ${escapeHtml(label)}` : ''}${note ? ` — ${escapeHtml(note)}` : ''} · ${friendlyDate(date, today)}`;
}

export function announcement(header: string, who: string, lines: string[]): string {
  return [`${header} · ${escapeHtml(who)}`, ...lines].join('\n');
}

export interface WebEntry {
  kind: 'spend' | 'income' | 'withdrawal';
  amountIls: number;
  category: string;
  note: string | null;
  date: string;
  memberId: string;
  envelopeId?: string | null;
  envelopeType?: string | null;
}

/** An entry added on the dashboard, told to the group like one from the bot. */
export async function announceWebEntry(entry: WebEntry): Promise<void> {
  try {
    if ((await familyGroupChatId()) === null) return;
    const { data: member } = await db().from('household_members').select('*').eq('id', entry.memberId).maybeSingle();
    const who = member ? memberName(member as { display_name: string; preferred_name?: string | null }) : '';

    if (entry.kind === 'spend') {
      const envelopes = await loadBotEnvelopes(entry.date.slice(0, 7));
      const label = envelopeOfSpend(
        { envelope_id: entry.envelopeId ?? null, envelope_type: entry.envelopeType ?? null, category: entry.category },
        envelopes,
      ).name;
      await announceToFamily(announcement('💸 נרשם במזומן', who, [entryLine(entry.amountIls, label, entry.note, entry.date)]));
      return;
    }
    const header = entry.kind === 'income' ? '💵 הכנסה במזומן' : '🏧 משיכה מהכספומט';
    const label = entry.kind === 'income' ? entry.category : null;
    await announceToFamily(announcement(header, who, [entryLine(entry.amountIls, label, entry.note, entry.date)]));
  } catch (error) {
    console.error('Could not tell the family group about a web entry', error);
  }
}
