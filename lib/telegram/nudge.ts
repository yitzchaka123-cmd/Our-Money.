import type { CashPlan, PlanOccurrence } from '@/lib/cash/plans';
import { formatIls } from '@/lib/money';
import { encodeCallback } from '@/lib/telegram/format';
import type { InlineKeyboard } from '@/lib/telegram/types';

export interface NudgeMember {
  id: string;
  displayName: string;
  telegramUserId: number;
}

export interface NudgeInput {
  members: NudgeMember[];
  /** Members who logged any cash today. */
  loggedToday: ReadonlySet<string>;
  due: Array<{ plan: CashPlan; occurrence: PlanOccurrence }>;
  reviewCount: number;
  /** Where the group message goes, or null to message members privately. */
  groupChatId: number | null;
}

export interface NudgeMessage {
  chatId: number;
  text: string;
  keyboard?: InlineKeyboard;
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function firstName(name: string): string {
  return name.split(' ')[0] || name;
}

/**
 * The evening message. It says only what needs doing — nothing at all on a
 * day when everyone has logged, nothing is due and nothing waits for review —
 * because a nudge that fires every night regardless trains people to ignore it.
 */
export function composeNudge(input: NudgeInput): NudgeMessage[] {
  const quiet = input.members.filter((m) => !input.loggedToday.has(m.id));
  const messages: NudgeMessage[] = [];

  const reminderLines = (names: string[] | null): string[] => {
    const lines: string[] = [];
    if (names && names.length > 0) {
      lines.push(`🌙 ${names.map(escape).join(' ו')} — היו היום הוצאות במזומן?`);
      lines.push('אפשר פשוט לכתוב או להקליט לי, למשל "50 שקל פלאפל".');
    }
    if (input.reviewCount > 0) {
      lines.push(
        input.reviewCount === 1
          ? 'יש רישום אחד שמחכה לאישור — /daily או בדאשבורד.'
          : `יש ${input.reviewCount} רישומים שמחכים לאישור — /daily או בדאשבורד.`,
      );
    }
    return lines;
  };

  const planMessage = (chatId: number, item: NudgeInput['due'][number]): NudgeMessage => {
    const { plan, occurrence } = item;
    const month = occurrence.date.slice(0, 7);
    const label = escape(plan.note || plan.category);
    const verb = plan.kind === 'income' ? 'התקבל' : 'שולם';
    return {
      chatId,
      text: `📅 ${plan.kind === 'income' ? 'צפוי להיכנס' : 'צפוי לצאת'} במזומן: <b>${label}</b> · ${formatIls(occurrence.amountIls)}`,
      keyboard: [
        [
          { text: `✅ ${verb}`, callback_data: encodeCallback({ kind: 'settle_plan', spendId: plan.id, month }) },
          { text: '⏭ לא החודש', callback_data: encodeCallback({ kind: 'skip_plan', spendId: plan.id, month }) },
        ],
      ],
    };
  };

  if (input.groupChatId !== null) {
    const lines = reminderLines(quiet.map((m) => firstName(m.displayName)));
    if (lines.length > 0) messages.push({ chatId: input.groupChatId, text: lines.join('\n') });
    for (const item of input.due) messages.push(planMessage(input.groupChatId, item));
    return messages;
  }

  // No group: each member hears about their own day and their own plans.
  for (const member of input.members) {
    const lines = reminderLines(quiet.includes(member) ? [firstName(member.displayName)] : null);
    if (lines.length > 0) messages.push({ chatId: member.telegramUserId, text: lines.join('\n') });
    for (const item of input.due) {
      if (item.plan.member_id === null || item.plan.member_id === member.id) {
        messages.push(planMessage(member.telegramUserId, item));
      }
    }
  }
  return messages;
}
