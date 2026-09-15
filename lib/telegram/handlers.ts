import { createSessionToken } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { activeCategories } from '@/lib/intake/categories';
import { isoDateInIsrael, parseIntake } from '@/lib/intake/parse';
import {
  monthBounds,
  totalsByCategory,
  totalsByMember,
  walletState,
} from '@/lib/reconcile';
import { syncRiseup } from '@/lib/riseup/sync';
import { transcribe } from '@/lib/stt';
import {
  answerCallbackQuery,
  downloadFile,
  editMessageText,
  escapeHtml,
  sendMessage,
  sendTyping,
} from '@/lib/telegram/client';
import {
  categoryKeyboard,
  decodeCallback,
  formatIls,
  friendlyDate,
  savedMessage,
  spendKeyboard,
  spendLine,
} from '@/lib/telegram/format';
import type { TelegramMessage, TelegramUpdate } from '@/lib/telegram/types';
import {
  activeTopups,
  allLiveSpends,
  attachBotMessage,
  getSpend,
  insertSpends,
  lastSpendForMember,
  membersById,
  resolveMember,
  spendsBetween,
  updateAlreadyProcessed,
  updateSpend,
  type NewSpend,
} from '@/lib/db/queries';
import type { HouseholdMember } from '@/lib/types';

const HELP = [
  '<b>Our Money</b> — יומן המזומן שלנו 💸',
  '',
  'פשוט תכתבו או תקליטו מה הוצאתם, בעברית או באנגלית:',
  '• <i>"80 שקל בסופר"</i>',
  '• <i>"שילמתי 45 על מונית אתמול"</i>',
  '• <i>"120 במכולת ועוד 30 על קפה"</i>',
  '',
  '<b>פקודות</b>',
  '/balance — כמה מזומן אמור להיות בארנק',
  '/today — ההוצאות של היום',
  '/month — סיכום החודש לפי קטגוריה',
  '/undo — מחיקת הרישום האחרון',
  '/dashboard — קישור לדאשבורד המלא',
  '/sync — משיכת נתונים מרייזאפ עכשיו',
  '/categories — רשימת הקטגוריות',
  '/id — מזהי הצ׳אט (שימושי להגדרת קבוצה)',
].join('\n');

const NOT_AUTHORIZED = [
  '🔒 הבוט הזה פרטי.',
  '',
  'אם זה הבוט שלכם, הוסיפו את מזהה המשתמש שלכם ל-TELEGRAM_ALLOWED_USER_IDS ופרסו מחדש.',
].join('\n');

let cachedBotUsername: string | null = null;

async function botUsername(): Promise<string> {
  if (cachedBotUsername) return cachedBotUsername;
  const response = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/getMe`);
  const payload = (await response.json()) as { result?: { username?: string } };
  cachedBotUsername = payload.result?.username ?? '';
  return cachedBotUsername;
}

export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) return handleCallback(update);
  const message = update.message;
  if (!message?.from) return;

  const member = await resolveMember(
    message.from.id,
    [message.from.first_name, message.from.last_name].filter(Boolean).join(' '),
  );

  const isPrivate = message.chat.type === 'private';

  if (!member) {
    // In a group, an unknown speaker is just someone else talking — staying
    // quiet is correct. In a DM, they deserve an explanation.
    if (isPrivate) await sendMessage(message.chat.id, NOT_AUTHORIZED);
    return;
  }

  if (!isPrivate && !(await isAddressedToBot(message))) return;

  const text = (message.text ?? message.caption ?? '').trim();
  if (text.startsWith('/')) return handleCommand(message, member, text);

  if (message.voice || message.audio) return handleVoice(update, message, member);
  if (text) return handleText(update, message, member, text);
}

/**
 * In the shared group the bot is a guest: it acts only when spoken to, so the
 * couple can talk to each other without every message becoming an expense.
 */
async function isAddressedToBot(message: TelegramMessage): Promise<boolean> {
  const username = await botUsername();
  const text = message.text ?? message.caption ?? '';

  if (username && text.includes(`@${username}`)) return true;
  if (message.reply_to_message?.from?.is_bot) return true;
  if (text.startsWith('/')) return true;
  return false;
}

async function handleCommand(
  message: TelegramMessage,
  member: HouseholdMember,
  text: string,
): Promise<void> {
  const chatId = message.chat.id;
  // "/month@our_money_bot 2026-08" -> command "/month", args ["2026-08"]
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = (rawCommand ?? '').split('@')[0]?.toLowerCase() ?? '';

  switch (command) {
    case '/start':
    case '/help':
      await sendMessage(chatId, HELP);
      return;

    case '/id':
      await sendMessage(
        chatId,
        [
          `Chat id: <code>${chatId}</code>`,
          `Your user id: <code>${message.from?.id}</code>`,
          '',
          'לקבוצה משותפת — הכניסו את ה-Chat id ל-TELEGRAM_GROUP_CHAT_ID.',
        ].join('\n'),
      );
      return;

    case '/categories': {
      const categories = await activeCategories();
      await sendMessage(
        chatId,
        ['<b>קטגוריות פעילות</b>', '', ...categories.map((c) => `• ${escapeHtml(c)}`)].join('\n'),
      );
      return;
    }

    case '/dashboard': {
      const token = createSessionToken(member.id);
      await sendMessage(
        chatId,
        [
          '📊 <b>הדאשבורד שלכם</b>',
          '',
          `${env.appBaseUrl}/api/auth/telegram?t=${token}`,
          '',
          'הקישור אישי ותקף לשבוע. אל תעבירו אותו הלאה.',
        ].join('\n'),
      );
      return;
    }

    case '/balance':
      await sendBalance(chatId);
      return;

    case '/today':
      await sendToday(chatId);
      return;

    case '/month':
      await sendMonth(chatId, args[0]);
      return;

    case '/undo':
      await undoLast(chatId, member);
      return;

    case '/sync':
      await runSync(chatId);
      return;

    default:
      await sendMessage(chatId, 'לא מכיר את הפקודה הזו. /help לרשימה.');
  }
}

async function handleText(
  update: TelegramUpdate,
  message: TelegramMessage,
  member: HouseholdMember,
  text: string,
): Promise<void> {
  if (await updateAlreadyProcessed(update.update_id)) return;
  await sendTyping(message.chat.id);
  await logFromNaturalLanguage(update, message, member, text, 'text', null);
}

async function handleVoice(
  update: TelegramUpdate,
  message: TelegramMessage,
  member: HouseholdMember,
): Promise<void> {
  if (await updateAlreadyProcessed(update.update_id)) return;
  await sendTyping(message.chat.id);

  const clip = message.voice ?? message.audio;
  if (!clip) return;

  let transcript: string;
  try {
    const data = await downloadFile(clip.file_id);
    const result = await transcribe({
      data,
      filename: message.voice ? 'voice.ogg' : 'audio.mp3',
      mimeType: clip.mime_type ?? 'audio/ogg',
    });
    transcript = result.text;
  } catch (error) {
    await sendMessage(
      message.chat.id,
      `🎤 לא הצלחתי לתמלל את ההקלטה.\n<code>${escapeHtml(
        error instanceof Error ? error.message : String(error),
      )}</code>`,
    );
    return;
  }

  await logFromNaturalLanguage(update, message, member, transcript, 'voice', transcript);
}

async function logFromNaturalLanguage(
  update: TelegramUpdate,
  message: TelegramMessage,
  member: HouseholdMember,
  input: string,
  inputKind: 'text' | 'voice',
  transcript: string | null,
): Promise<void> {
  const chatId = message.chat.id;
  const today = isoDateInIsrael();

  let parsed;
  try {
    parsed = await parseIntake(input, { speakerName: member.display_name });
  } catch (error) {
    await sendMessage(
      chatId,
      `😕 נתקלתי בבעיה בהבנת ההודעה.\n<code>${escapeHtml(
        error instanceof Error ? error.message : String(error),
      )}</code>`,
    );
    return;
  }

  // A voice note that transcribed into nothing useful should show what was
  // heard — otherwise "I didn't understand" is impossible to debug by ear.
  if (parsed.entries.length === 0) {
    const heard =
      inputKind === 'voice' ? `\n\n<i>שמעתי:</i> ${escapeHtml(input)}` : '';
    await sendMessage(
      chatId,
      `${parsed.replyNote ?? 'לא מצאתי סכום בהודעה. כמה זה היה?'}${heard}`,
    );
    return;
  }

  const rows: NewSpend[] = parsed.entries.map((entry, index) => ({
    member_id: member.id,
    amount_ils: entry.amountIls,
    category: entry.category,
    note: entry.note || null,
    spent_at: entry.spentAt,
    status: entry.confidence === 'low' ? 'needs_review' : 'confirmed',
    confidence: entry.confidence,
    input_kind: inputKind,
    raw_input: input,
    transcript,
    // The unique constraint lives on one row, so only the first entry of a
    // multi-expense message carries the update id.
    telegram_update_id: index === 0 ? update.update_id : null,
    telegram_chat_id: chatId,
    telegram_message_id: message.message_id,
  }));

  const saved = await insertSpends(rows);
  const sent = await sendMessage(
    chatId,
    savedMessage(saved, today, member.display_name),
    spendKeyboard(saved),
  );
  await attachBotMessage(
    saved.map((s) => s.id),
    sent.message_id,
  );
}

async function handleCallback(update: TelegramUpdate): Promise<void> {
  const query = update.callback_query;
  if (!query?.data || !query.message) return;

  const member = await resolveMember(
    query.from.id,
    [query.from.first_name, query.from.last_name].filter(Boolean).join(' '),
  );
  if (!member) {
    await answerCallbackQuery(query.id, 'לא מורשה');
    return;
  }

  const action = decodeCallback(query.data);
  if (!action) {
    await answerCallbackQuery(query.id);
    return;
  }

  const spend = await getSpend(action.spendId);
  if (!spend) {
    await answerCallbackQuery(query.id, 'הרישום כבר לא קיים');
    return;
  }

  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const today = isoDateInIsrael();

  switch (action.kind) {
    case 'delete': {
      await updateSpend(spend.id, { status: 'deleted' });
      await editMessageText(
        chatId,
        messageId,
        `🗑 נמחק: ${formatIls(spend.amount_ils)} · ${escapeHtml(spend.category)}`,
      );
      await answerCallbackQuery(query.id, 'נמחק');
      return;
    }

    case 'confirm': {
      const updated = await updateSpend(spend.id, { status: 'confirmed', confidence: 'high' });
      await editMessageText(chatId, messageId, `✅ אושר\n\n• ${spendLine(updated, today)}`);
      await answerCallbackQuery(query.id, 'אושר');
      return;
    }

    case 'pick_category': {
      const categories = await activeCategories();
      await editMessageText(
        chatId,
        messageId,
        `באיזו קטגוריה לרשום את ${formatIls(spend.amount_ils)}?`,
        categoryKeyboard(spend.id, categories),
      );
      await answerCallbackQuery(query.id);
      return;
    }

    case 'set_category': {
      const categories = await activeCategories();
      const category = categories[action.categoryIndex];
      if (!category) {
        await answerCallbackQuery(query.id, 'קטגוריה לא נמצאה');
        return;
      }
      const updated = await updateSpend(spend.id, {
        category,
        status: 'confirmed',
        confidence: 'high',
      });
      await editMessageText(chatId, messageId, `✅ עודכן\n\n• ${spendLine(updated, today)}`);
      await answerCallbackQuery(query.id, category);
      return;
    }
  }
}

async function sendBalance(chatId: number): Promise<void> {
  const [topups, spends] = await Promise.all([activeTopups(), allLiveSpends()]);
  const state = walletState(topups, spends);

  const verdict =
    state.unaccounted > 0
      ? `אמור להיות בארנק: <b>${formatIls(state.unaccounted)}</b>`
      : state.unaccounted === 0
        ? 'הארנק מאוזן בדיוק 🎯'
        : `רשמתם <b>${formatIls(Math.abs(state.unaccounted))}</b> יותר ממה שנמשך — כנראה חסרה משיכה.`;

  await sendMessage(
    chatId,
    [
      '<b>💰 מצב המזומן</b>',
      '',
      `נמשך מהבנק: ${formatIls(state.toppedUp)} (${state.topupCount} משיכות)`,
      `נרשם כהוצאה: ${formatIls(state.logged)} (${state.spendCount} רישומים)`,
      '',
      verdict,
    ].join('\n'),
  );
}

async function sendToday(chatId: number): Promise<void> {
  const today = isoDateInIsrael();
  const spends = await spendsBetween(today, today);

  if (spends.length === 0) {
    await sendMessage(chatId, 'עוד לא נרשמו הוצאות מזומן היום.');
    return;
  }

  const total = spends.reduce((sum, s) => sum + Number(s.amount_ils), 0);
  await sendMessage(
    chatId,
    [
      `<b>היום · ${formatIls(total)}</b>`,
      '',
      ...spends.map((s) => `• ${spendLine(s, today)}`),
    ].join('\n'),
  );
}

async function sendMonth(chatId: number, requested?: string): Promise<void> {
  const today = isoDateInIsrael();
  const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : today.slice(0, 7);
  const { from, to } = monthBounds(month);

  const [spends, members] = await Promise.all([spendsBetween(from, to), membersById()]);
  if (spends.length === 0) {
    await sendMessage(chatId, `אין הוצאות מזומן רשומות ב-${month}.`);
    return;
  }

  const total = spends.reduce((sum, s) => sum + Number(s.amount_ils), 0);
  const byCategory = totalsByCategory(spends);
  const byMember = totalsByMember(spends);

  const memberLines = [...byMember.entries()].map(([memberId, amount]) => {
    const name = members.get(memberId)?.display_name ?? 'לא ידוע';
    return `• ${escapeHtml(name)}: ${formatIls(amount)}`;
  });

  await sendMessage(
    chatId,
    [
      `<b>💸 מזומן ב-${month} · ${formatIls(total)}</b>`,
      '',
      '<b>לפי קטגוריה</b>',
      ...byCategory.map(
        (row) => `• ${escapeHtml(row.category)}: ${formatIls(row.total)} (${row.count})`,
      ),
      '',
      '<b>לפי מי</b>',
      ...memberLines,
    ].join('\n'),
  );
}

async function undoLast(chatId: number, member: HouseholdMember): Promise<void> {
  const last = await lastSpendForMember(member.id);
  if (!last) {
    await sendMessage(chatId, 'אין מה לבטל.');
    return;
  }

  await updateSpend(last.id, { status: 'deleted' });
  await sendMessage(
    chatId,
    `🗑 בוטל: ${formatIls(last.amount_ils)} · ${escapeHtml(last.category)} · ${friendlyDate(
      last.spent_at,
      isoDateInIsrael(),
    )}`,
  );
}

async function runSync(chatId: number): Promise<void> {
  await sendTyping(chatId);
  const result = await syncRiseup();

  if (result.error) {
    await sendMessage(
      chatId,
      result.tokenExpired
        ? [
            '🔑 <b>הטוקן של רייזאפ פג</b>',
            '',
            'טוקנים תקפים ל-30 יום. צרו חדש עם ההרשאה budget:read ב-',
            'https://input.riseup.co.il/developer/tokens',
            'ועדכנו את RISEUP_PAT.',
          ].join('\n')
        : `⚠️ הסנכרון נכשל:\n<code>${escapeHtml(result.error)}</code>`,
    );
    return;
  }

  const lines = [
    '🔄 <b>סנכרון הושלם</b>',
    '',
    `חודשים: ${result.months.join(', ')}`,
    `עסקאות: ${result.transactionsUpserted}`,
    `מעטפות: ${result.envelopesUpserted}`,
  ];

  if (result.newTopups.length > 0) {
    lines.push('', '<b>משיכות מזומן חדשות</b>');
    for (const topup of result.newTopups) {
      lines.push(
        `• ${formatIls(Number(topup.amount_ils))} · ${escapeHtml(
          topup.business_name ?? 'משיכה',
        )} · ${friendlyDate(topup.occurred_at, isoDateInIsrael())}`,
      );
    }
  }

  await sendMessage(chatId, lines.join('\n'));
}
