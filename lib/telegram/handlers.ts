import { issueLoginCode } from '@/lib/auth/codes';
import { createSessionToken } from '@/lib/auth/session';
import { loadPlan, settlePlanOccurrence, skipPlanOccurrence } from '@/lib/cash/plan-store';
import { env } from '@/lib/env';
import { loadBotEnvelopes } from '@/lib/intake/categories';
import { envelopeOfSpend, fileExpense, sameEnvelopeIn, type BotEnvelope } from '@/lib/intake/envelopes';
import { isoDateInIsrael, parseIntake, type IntakeResult } from '@/lib/intake/parse';
import {
  monthBounds,
  totalsByMember,
  walletBalances,
  walletState,
} from '@/lib/reconcile';
import { db } from '@/lib/db/client';
import type { CashTransfer } from '@/lib/types';
import { syncRiseup } from '@/lib/riseup/sync';
import { transcribe } from '@/lib/stt';
import {
  answerCallbackQuery,
  downloadFile,
  editMessageText,
  escapeHtml,
  leaveChat,
  sendMessage,
  sendTyping,
} from '@/lib/telegram/client';
import {
  categoryKeyboard,
  decodeCallback,
  encodeCallback,
  formatIls,
  friendlyDate,
  savedMessage,
  spendKeyboard,
  spendLine,
  nameTag,
  walletTag,
} from '@/lib/telegram/format';
import { assignWithdrawal } from '@/lib/cash/withdrawal-wallet';
import type {
  TelegramChat,
  TelegramChatMemberUpdated,
  TelegramMessage,
  TelegramUpdate,
  TelegramUser,
} from '@/lib/telegram/types';
import { announceToFamily, announcement, entryLine } from '@/lib/telegram/announce';
import {
  addToGroupUrl,
  botIdentity,
  familyGroupChatId,
  forgetFamilyGroup,
  getFamilyGroup,
  moveFamilyGroup,
  saveFamilyGroup,
  STARTGROUP_PAYLOAD,
} from '@/lib/telegram/group';
import {
  activeTopups,
  allLiveSpends,
  attachBotMessage,
  dismissTopup,
  getTopup,
  insertCashIncomes,
  insertManualWithdrawals,
  lastCashRowForMember,
  listWallets,
  matchWalletByName,
  getSpend,
  insertSpends,
  membersById,
  resolveMember,
  spendsBetween,
  spendsOfBotMessage,
  updateAlreadyProcessed,
  updateSpend,
  type NewSpend,
} from '@/lib/db/queries';
import type { CashSpend, HouseholdMember } from '@/lib/types';
import { confirmModeOf } from '@/lib/telegram/settings';
import { memberName } from '@/lib/profile/names';
import { readReceiptMessage, receiptFileOf, type ReceiptFile } from '@/lib/telegram/photo';

const HELP = [
  '<b>Our Money</b> — יומן המזומן שלנו 💸',
  '',
  'פשוט תכתבו או תקליטו מה הוצאתם, בעברית או באנגלית. אפשר להגיד גם מאיזה ארנק ("מהארנק של שרה"):',
  '• <i>"80 שקל בסופר"</i>',
  '• <i>"שילמתי 45 על מונית אתמול"</i>',
  '• <i>"120 במכולת ועוד 30 על קפה"</i>',
  '• <i>"קיבלתי 200 שקל מסבתא"</i> — הכנסה במזומן',
  '',
  '📸 אפשר גם לצלם קבלה ולשלוח לי — אקרא ממנה את הסכום ואת שם העסק, ואפשר להוסיף כיתוב כמו <i>"מזומן"</i>. שליחה כקובץ (לא כתמונה) נותנת טקסט חד יותר.',
  '',
  '<b>פקודות</b>',
  '/balance — כמה מזומן אמור להיות בארנק, לפי ארנק',
  '/today — ההוצאות של היום',
  '/month — סיכום החודש לפי קטגוריה',
  '/undo — מחיקת הרישום האחרון',
  '/dashboard — קישור לדאשבורד המלא',
  '/sync — משיכת נתונים מרייזאפ עכשיו',
  '/categories — המעטפות שאפשר לרשום אליהן',
  '/group — קבוצה משפחתית: שניכם רואים כל רישום',
  '/id — המזהים של הצ׳אט הזה',
].join('\n');

/** Includes the sender's own id: it is theirs to know, and it is exactly what setup needs. */
function notAuthorized(telegramUserId: number): string {
  return [
    '🔒 הבוט הזה פרטי.',
    '',
    `מזהה המשתמש שלך בטלגרם: <code>${telegramUserId}</code>`,
    'אם זה הבוט שלכם, הוסיפו את המספר הזה ל-TELEGRAM_ALLOWED_USER_IDS ב-Vercel ופרסו מחדש.',
  ].join('\n');
}

async function botUsername(): Promise<string> {
  return (await botIdentity())?.username ?? '';
}

export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) return handleCallback(update);
  if (update.my_chat_member) return handleMembership(update.my_chat_member);
  const message = update.message;
  if (!message?.from) return;

  // A group that became a supergroup changes its id; keep following it.
  if (message.migrate_to_chat_id) {
    await moveFamilyGroup(message.chat.id, message.migrate_to_chat_id);
    return;
  }
  // "X added the bot": the service message that comes with being added.
  if (message.new_chat_members?.length) {
    const bot = await botIdentity();
    if (bot && message.new_chat_members.some((u) => u.id === bot.id)) {
      await botAddedToGroup(message.chat, message.from);
    }
    return;
  }

  const member = await resolveMember(
    message.from.id,
    [message.from.first_name, message.from.last_name].filter(Boolean).join(' '),
  );

  const isPrivate = message.chat.type === 'private';

  if (!member) {
    // In a group, an unknown speaker is just someone else talking — staying
    // quiet is correct. In a DM, they deserve an explanation.
    if (isPrivate) await sendMessage(message.chat.id, notAuthorized(message.from.id));
    return;
  }

  // In the family group every message from the two of them is for the bot
  // (it stays quiet when there is no amount); in any other group, only what
  // is addressed to it.
  const addressed = isPrivate || (await isAddressedToBot(message));
  const inFamilyGroup = !isPrivate && (await familyGroupChatId()) === message.chat.id;
  if (!addressed && !inFamilyGroup) return;
  const quiet = !addressed;

  const text = (message.text ?? message.caption ?? '').trim();
  if (text.startsWith('/')) return handleCommand(message, member, text);

  const receipt = receiptFileOf(message);
  if (receipt) return handlePhoto(update, message, member, receipt, quiet);
  if (message.voice || message.audio) return handleVoice(update, message, member, quiet);
  if (text) return handleText(update, message, member, text, quiet);
}

/** The bot's own membership changed: added to a group, or removed from one. */
async function handleMembership(change: TelegramChatMemberUpdated): Promise<void> {
  if (change.chat.type !== 'group' && change.chat.type !== 'supergroup') return;
  const before = change.old_chat_member.status;
  const after = change.new_chat_member.status;
  const wasIn = before === 'member' || before === 'administrator' || before === 'creator' || before === 'restricted';
  const isIn = after === 'member' || after === 'administrator' || after === 'creator' || after === 'restricted';

  if (isIn && !wasIn) {
    await botAddedToGroup(change.chat, change.from);
    return;
  }
  if (!isIn && wasIn) await forgetFamilyGroup(change.chat.id);
}

/**
 * Someone added the bot to a group. If it is one of the two of them, this is
 * the family group from now on: remember it and say hello there, once.
 * Anyone else gets a polite no, and the bot leaves.
 */
async function botAddedToGroup(chat: TelegramChat, from: TelegramUser): Promise<void> {
  if (chat.type !== 'group' && chat.type !== 'supergroup') return;
  const member = await resolveMember(from.id, [from.first_name, from.last_name].filter(Boolean).join(' '));
  if (!member) {
    await sendMessage(chat.id, '🔒 הבוט הזה פרטי, ורק בני הבית יכולים להוסיף אותו לקבוצה. להתראות!').catch(() => undefined);
    await leaveChat(chat.id);
    return;
  }

  const isNew = await saveFamilyGroup(chat.id, chat.title ?? null, member.id);
  if (!isNew) return;
  await sendMessage(chat.id, familyGroupWelcome(await botUsername()));
}

function familyGroupWelcome(username: string): string {
  return [
    '👋 <b>הקבוצה המשפחתית מחוברת!</b>',
    '',
    'מעכשיו כל הוצאה והכנסה במזומן שתרשמו — כאן או אצלי בפרטי — תופיע בקבוצה: מי רשם, כמה, ובאיזו מעטפה.',
    '',
    'אפשר לרשום גם מכאן: פשוט כתבו או הקליטו, למשל <i>"80 בסופר"</i>.',
    username
      ? `אם אני לא מגיב להודעה רגילה, ענו להודעה שלי או כתבו @${escapeHtml(username)} — או הפכו אותי למנהל בקבוצה, ואז אראה כל הודעה.`
      : 'אם אני לא מגיב להודעה רגילה, ענו להודעה שלי — או הפכו אותי למנהל בקבוצה, ואז אראה כל הודעה.',
  ].join('\n');
}

/** /group: how to set up the family group, or which one is connected. */
async function sendGroupHelp(chatId: number): Promise<void> {
  const [group, username] = await Promise.all([getFamilyGroup(), botUsername()]);
  if (group) {
    await sendMessage(
      chatId,
      [
        `✅ <b>הקבוצה המשפחתית מחוברת</b>${group.title ? `: ${escapeHtml(group.title)}` : ''}`,
        '',
        'כל הוצאה והכנסה במזומן נשלחת לשם — מי רשם, כמה, ובאיזו מעטפה. שניכם יכולים לרשום גם מתוך הקבוצה.',
        '',
        'רוצים קבוצה אחרת? פשוט הוסיפו אותי אליה, והיא תחליף את הנוכחית.',
      ].join('\n'),
      username ? [[{ text: '➕ להוסיף לקבוצה אחרת', url: addToGroupUrl(username) }]] : undefined,
    );
    return;
  }
  await sendMessage(
    chatId,
    [
      '👨‍👩‍👧 <b>קבוצה משפחתית — שלושה צעדים</b>',
      '',
      '1. פתחו בטלגרם קבוצה עם בן או בת הזוג (או בחרו קבוצה שכבר יש לכם).',
      username
        ? '2. לחצו על הכפתור למטה ובחרו את הקבוצה.'
        : '2. בקבוצה: לחצו על שם הקבוצה ← הוספת משתתפים ← חפשו אותי והוסיפו.',
      '3. זהו! אכתוב בקבוצה שהיא מחוברת, ומאז כל רישום במזומן יופיע שם.',
      '',
      'שניכם יכולים לרשום גם מתוך הקבוצה.',
    ].join('\n'),
    username ? [[{ text: '➕ הוספה לקבוצה', url: addToGroupUrl(username) }]] : undefined,
  );
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
      // "Add to group" ends with "/start family" in the new group.
      if (message.chat.type !== 'private' && args[0] === STARTGROUP_PAYLOAD && message.from) {
        await botAddedToGroup(message.chat, message.from);
        return;
      }
      await sendMessage(chatId, HELP);
      return;

    case '/help':
      await sendMessage(chatId, HELP);
      return;

    case '/group':
      await sendGroupHelp(chatId);
      return;

    case '/id': {
      const group = await getFamilyGroup();
      const here = message.chat.type === 'private' ? 'הצ׳אט הפרטי שלך איתי' : 'הקבוצה הזו';
      await sendMessage(
        chatId,
        [
          '🆔 <b>המזהים כאן</b>',
          `${here}: <code>${chatId}</code>`,
          `המשתמש שלך בטלגרם: <code>${message.from?.id}</code>`,
          '',
          group?.chatId === chatId
            ? '✅ זו הקבוצה המשפחתית — כל רישום במזומן מופיע כאן.'
            : group
              ? '✅ יש לכם קבוצה משפחתית מחוברת. /group לפרטים.'
              : 'אין צורך להעתיק מספרים לשום מקום. רוצים ששניכם תראו כל רישום? שלחו /group ואסביר בשלושה צעדים.',
        ].join('\n'),
      );
      return;
    }

    case '/categories': {
      const envelopes = await loadBotEnvelopes(isoDateInIsrael().slice(0, 7));
      await sendMessage(
        chatId,
        [
          '<b>המעטפות שלכם החודש</b>',
          '',
          ...envelopes.map((e) => `• ${escapeHtml(e.name)}`),
          '',
          'כל הוצאה נרשמת לאחת מהן. מה שלא מתאים לאף אחת נכנס להוצאות המשתנות.',
        ].join('\n'),
      );
      return;
    }

    case '/dashboard': {
      // A sign-in link is personal. In the group, send it privately instead.
      const privateChat = message.chat.type === 'private' ? chatId : message.from?.id;
      if (!privateChat) return;
      const token = createSessionToken(member.id);
      const code = await issueLoginCode(member.id);
      const sent = await sendMessage(
        privateChat,
        [
          '📊 <b>הדאשבורד שלכם</b>',
          '',
          `${env.appBaseUrl}/api/auth/telegram?t=${token}`,
          '',
          `קוד לאפליקציה שעל מסך הבית: <code>${code}</code>`,
          '',
          'הקישור אישי ותקף לשבוע, הקוד לעשר דקות. אל תעבירו אותם הלאה.',
        ].join('\n'),
      ).then(
        () => true,
        () => false,
      );
      if (message.chat.type !== 'private') {
        await sendMessage(
          chatId,
          sent
            ? 'שלחתי לך קישור כניסה בהודעה פרטית 🔒'
            : 'כדי לקבל קישור כניסה, פתחו איתי שיחה פרטית ושלחו שם /dashboard.',
        );
      }
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
  quiet = false,
): Promise<void> {
  if (await updateAlreadyProcessed(update.update_id)) return;
  if (!quiet) await sendTyping(message.chat.id);
  await logFromNaturalLanguage(update, message, member, text, 'text', null, quiet);
}

async function handleVoice(
  update: TelegramUpdate,
  message: TelegramMessage,
  member: HouseholdMember,
  quiet = false,
): Promise<void> {
  if (await updateAlreadyProcessed(update.update_id)) return;
  if (!quiet) await sendTyping(message.chat.id);

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
    console.error('Transcription failed', error);
    if (quiet) return;
    await sendMessage(
      message.chat.id,
      '🎤 לא הצלחתי לתמלל את ההקלטה. אפשר להקליט שוב, או פשוט לכתוב — שום דבר לא נרשם.',
    );
    return;
  }

  await logFromNaturalLanguage(update, message, member, transcript, 'voice', transcript, quiet);
}

/** C25: a photo of a receipt, read by the AI, then saved like any other spend. */
async function handlePhoto(
  update: TelegramUpdate,
  message: TelegramMessage,
  member: HouseholdMember,
  file: ReceiptFile,
  quiet = false,
): Promise<void> {
  if (await updateAlreadyProcessed(update.update_id)) return;
  if (!quiet) await sendTyping(message.chat.id);
  const outcome = await readReceiptMessage(message, file, {
    speakerName: memberName(member),
    wallets: (await listWallets()).map((w) => w.name),
    botUsername: await botUsername(),
  });
  if (outcome.kind === 'reply') {
    if (!quiet) await sendMessage(message.chat.id, outcome.text);
    return;
  }
  await logFromNaturalLanguage(update, message, member, outcome.rawInput, 'text', null, quiet, outcome.parsed);
}

async function logFromNaturalLanguage(
  update: TelegramUpdate,
  message: TelegramMessage,
  member: HouseholdMember,
  input: string,
  inputKind: 'text' | 'voice',
  transcript: string | null,
  /** In the family group, chat that is not about money gets no reply. */
  quiet = false,
  /** Already read (a receipt photo): skip the text parse. */
  preParsed: IntakeResult | null = null,
): Promise<void> {
  const chatId = message.chat.id;
  const today = isoDateInIsrael();

  const wallets = await listWallets();
  const envelopes = await loadBotEnvelopes(today.slice(0, 7));
  let parsed = preParsed;
  try {
    parsed ??= await parseIntake(input, {
      speakerName: memberName(member),
      wallets: wallets.map((w) => w.name),
      envelopes,
    });
  } catch (error) {
    // The detail is for the logs; the couple needs to know what to do.
    console.error('Intake parse failed', error);
    if (quiet) return;
    await sendMessage(chatId, '😕 לא הצלחתי לעבד את ההודעה כרגע. נסו לשלוח שוב בעוד רגע — שום דבר לא נרשם.');
    return;
  }

  // A voice note that transcribed into nothing useful should show what was
  // heard — otherwise "I didn't understand" is impossible to debug by ear.
  if (parsed.entries.length === 0) {
    if (quiet) return;
    const heard =
      inputKind === 'voice' ? `\n\n<i>שמעתי:</i> ${escapeHtml(input)}` : '';
    await sendMessage(
      chatId,
      `${parsed.replyNote ?? 'לא מצאתי סכום בהודעה. כמה זה היה?'}${heard}`,
    );
    return;
  }

  const expenses = parsed.entries.filter((e) => e.direction === 'expense');
  const incomes = parsed.entries.filter((e) => e.direction === 'income');
  const withdrawals = parsed.entries.filter((e) => e.direction === 'withdrawal');

  // Cash is filed into the household's own envelopes, so it shows up in the
  // same card a card spend would. The pin is resolved now, against the
  // entry's month (yesterday may be last month).
  const monthsNeeded = [...new Set(expenses.map((e) => e.spentAt.slice(0, 7)))];
  const envelopesByMonth = new Map<string, BotEnvelope[]>(
    await Promise.all(
      monthsNeeded.map(async (m) => [m, m === today.slice(0, 7) ? envelopes : await loadBotEnvelopes(m)] as const),
    ),
  );

  const askFirst = confirmModeOf(member) === 'ask';
  const defaultWallet = wallets.find((w) => w.is_default) ?? wallets[0] ?? null;
  const walletFor = (name: string | null) => (matchWalletByName(wallets, name) ?? defaultWallet)?.id ?? null;

  const rows: NewSpend[] = expenses.map((entry, index) => {
    const chosen = fileExpense(entry.category, entry.note, envelopes);
    const target = sameEnvelopeIn(chosen, envelopesByMonth.get(entry.spentAt.slice(0, 7)) ?? envelopes);
    return {
      member_id: member.id,
      amount_ils: entry.amountIls,
      category: target.name,
      note: entry.note || null,
      spent_at: entry.spentAt,
      // "לשאול לפני שרושמים" (Settings → טלגרם): nothing is approved until "לאשר".
      status: askFirst || entry.confidence === 'low' ? 'needs_review' : 'confirmed',
      confidence: entry.confidence,
      input_kind: inputKind,
      raw_input: input,
      transcript,
      // The unique constraint lives on one row, so only the first entry of a
      // multi-expense message carries the update id.
      telegram_update_id: index === 0 ? update.update_id : null,
      telegram_chat_id: chatId,
      telegram_message_id: message.message_id,
      envelope_id: target.envelopeId,
      envelope_type: target.type,
      wallet_id: walletFor(entry.wallet),
    };
  });

  const [saved, savedIncomes, savedWithdrawals] = await Promise.all([
    insertSpends(rows),
    insertCashIncomes(
      incomes.map((entry) => ({
        member_id: member.id,
        amount_ils: entry.amountIls,
        category: entry.category,
        note: entry.note || null,
        occurred_at: entry.spentAt,
        input_kind: inputKind,
        wallet_id: walletFor(entry.wallet),
      })),
    ),
    insertManualWithdrawals(
      withdrawals.map((entry) => ({
        member_id: member.id,
        amount_ils: entry.amountIls,
        occurred_at: entry.spentAt,
        note: entry.note || null,
        input_kind: inputKind,
        wallet_id: walletFor(entry.wallet),
      })),
    ),
  ]);

  if (saved.length > 0) {
    const sent = await sendMessage(
      chatId,
      savedMessage(saved, today, memberName(member)),
      spendKeyboard(saved),
    );
    await attachBotMessage(
      saved.map((s) => s.id),
      sent.message_id,
    );
    // Waiting for "לאשר" is not news yet; the group hears once it is approved.
    const counted = saved.filter((s) => s.status === 'confirmed');
    if (counted.length > 0) {
      await announceToFamily(
        announcement('💸 נרשם במזומן', memberName(member), counted.map((s) => `• ${spendLine(s, today)}`)),
        chatId,
      );
    }
  }

  const walletName = (id: string | null) =>
    wallets.length > 1 ? ` · ${escapeHtml(wallets.find((w) => w.id === id)?.name ?? '')}` : '';

  for (const t of savedIncomes) {
    await sendMessage(
      chatId,
      [
        `💵 נרשמה הכנסה במזומן · ${escapeHtml(memberName(member))}`,
        '',
        `• <b>${formatIls(Number(t.amount_ils))}</b> · ${escapeHtml(t.category ?? '')}${
          t.note ? ` — ${escapeHtml(t.note)}` : ''
        } · ${friendlyDate(t.occurred_at, today)}${walletName(t.wallet_id)}`,
      ].join('\n'),
      [[{ text: '🗑 מחיקה', callback_data: encodeCallback({ kind: 'delete_income', spendId: t.id }) }]],
    );
    await announceToFamily(
      announcement('💵 הכנסה במזומן', memberName(member), [entryLine(Number(t.amount_ils), t.category, t.note, t.occurred_at, today)]),
      chatId,
    );
  }

  for (const t of savedWithdrawals) {
    await sendMessage(
      chatId,
      [
        `🏧 נרשמה משיכה · ${escapeHtml(memberName(member))}`,
        '',
        `• <b>${formatIls(Number(t.amount_ils))}</b> · ${friendlyDate(t.occurred_at, today)}${walletName(t.wallet_id)}`,
        '',
        'כשהמשיכה תופיע ברייזאפ היא תותאם לרישום הזה — היא לא תיספר פעמיים.',
      ].join('\n'),
      [[{ text: '🗑 מחיקה', callback_data: encodeCallback({ kind: 'delete_income', spendId: t.id }) }]],
    );
    await announceToFamily(
      announcement('🏧 משיכה מהכספומט', memberName(member), [entryLine(Number(t.amount_ils), null, t.note, t.occurred_at, today)]),
      chatId,
    );
  }
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

  // Expected-cash buttons from the evening nudge act on a plan's month.
  if (action.kind === 'settle_plan' || action.kind === 'skip_plan') {
    const chat = query.message.chat.id;
    const messageId = query.message.message_id;
    if (action.kind === 'settle_plan') {
      const result = await settlePlanOccurrence(action.spendId, action.month, member.id);
      if (!result.ok) {
        await answerCallbackQuery(query.id, result.error);
        return;
      }
      await editMessageText(
        chat,
        messageId,
        `✅ נרשם: ${formatIls(result.amountIls)} · ${escapeHtml(result.plan.note || result.plan.category)}`,
      );
      await answerCallbackQuery(query.id, 'נרשם');
      return;
    }
    const plan = await loadPlan(action.spendId);
    if (!plan) {
      await answerCallbackQuery(query.id, 'התכנון כבר לא קיים');
      return;
    }
    await skipPlanOccurrence(plan.id, action.month);
    await editMessageText(chat, messageId, `⏭ לא החודש: ${escapeHtml(plan.note || plan.category)}`);
    await answerCallbackQuery(query.id, 'דילגתי');
    return;
  }

  // "Which wallet did this withdrawal go into?" (asked after a sync).
  if (action.kind === 'assign_wallet') {
    const topup = await getTopup(action.spendId);
    if (!topup || topup.is_dismissed) {
      await answerCallbackQuery(query.id, 'המשיכה כבר לא קיימת');
      return;
    }
    const wallets = await listWallets();
    const wallet = wallets[action.walletIndex];
    if (!wallet || walletTag(wallet.id) !== action.walletTag) {
      await answerCallbackQuery(query.id, 'רשימת הארנקים השתנתה — אפשר לבחור באפליקציה');
      return;
    }
    // The member was checked above: only the household's Telegram users get here.
    const result = await assignWithdrawal(topup.id, wallet.id);
    if (!result.ok) {
      await answerCallbackQuery(query.id, result.error);
      return;
    }
    await editMessageText(
      query.message.chat.id,
      query.message.message_id,
      `✅ המשיכה של <b>${formatIls(Number(topup.amount_ils))}</b> מ-${friendlyDate(topup.occurred_at, isoDateInIsrael())} נכנסה ל${escapeHtml(result.walletName)} · ${escapeHtml(memberName(member))}`,
    );
    await answerCallbackQuery(query.id, wallet.name);
    return;
  }

  // Top-up actions (cash income, manual or detected withdrawals) act on
  // cash_topups, not on a spend.
  if (action.kind === 'delete_income' || action.kind === 'dismiss_topup') {
    const topup = await getTopup(action.spendId);
    if (!topup || topup.is_dismissed) {
      await answerCallbackQuery(query.id, 'הרישום כבר לא קיים');
      return;
    }
    await dismissTopup(topup.id);
    if (action.kind === 'delete_income') {
      await announceToFamily(
        announcement('🗑 נמחק', memberName(member), [
          entryLine(Number(topup.amount_ils), topup.category, topup.note, topup.occurred_at),
        ]),
        query.message.chat.id,
      );
    }
    await editMessageText(
      query.message.chat.id,
      query.message.message_id,
      action.kind === 'dismiss_topup'
        ? `↩️ הוסר — ${formatIls(Number(topup.amount_ils))} ${escapeHtml(topup.business_name ?? '')} לא נספר כמשיכה.`
        : `🗑 נמחק: ${formatIls(Number(topup.amount_ils))}${topup.category ? ` · ${escapeHtml(topup.category)}` : ''}`,
    );
    await answerCallbackQuery(query.id, 'עודכן');
    return;
  }

  const spend = await getSpend(action.spendId);
  if (!spend || spend.status === 'deleted') {
    await answerCallbackQuery(query.id, 'הרישום כבר לא קיים');
    return;
  }

  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  switch (action.kind) {
    case 'delete': {
      await updateSpend(spend.id, { status: 'deleted' });
      if (spend.status === 'confirmed') {
        await announceToFamily(announcement('🗑 נמחק', memberName(member), [`• ${spendLine(spend, isoDateInIsrael())}`]), chatId);
      }
      await editMessageText(
        chatId,
        messageId,
        `🗑 נמחק: ${formatIls(spend.amount_ils)} · ${escapeHtml(spend.category)}`,
      );
      await answerCallbackQuery(query.id, 'נמחק');
      return;
    }

    case 'confirm': {
      // "לאשר" approves everything the message is about.
      const rows = await messageSpends(spend);
      const approved: CashSpend[] = [];
      for (const row of rows.filter((r) => r.status === 'needs_review')) {
        approved.push(await updateSpend(row.id, { status: 'confirmed', confidence: 'high' }));
      }
      await redrawSpendMessage(chatId, messageId, spend);
      if (approved.length > 0) {
        const today = isoDateInIsrael();
        await announceToFamily(
          announcement('💸 נרשם במזומן', memberName(member), approved.map((s) => `• ${spendLine(s, today)}`)),
          chatId,
        );
      }
      await answerCallbackQuery(query.id, 'אושר');
      return;
    }

    case 'pick_category': {
      const envelopes = await loadBotEnvelopes(spend.spent_at.slice(0, 7));
      await editMessageText(
        chatId,
        messageId,
        `לאיזו מעטפה לרשום את ${formatIls(spend.amount_ils)}${spend.note ? ` (${escapeHtml(spend.note)})` : ''}?`,
        categoryKeyboard(spend.id, envelopes.map((e) => e.name)),
      );
      await answerCallbackQuery(query.id);
      return;
    }

    case 'back': {
      await redrawSpendMessage(chatId, messageId, spend);
      await answerCallbackQuery(query.id);
      return;
    }

    case 'set_category': {
      // The index is into the spend's own month's envelopes, as the picker showed them.
      const envelopes = await loadBotEnvelopes(spend.spent_at.slice(0, 7));
      const target = envelopes[action.categoryIndex];
      // Renamed or added since the picker was shown: the index may now point elsewhere.
      if (!target || (action.tag && nameTag(target.name) !== action.tag)) {
        await answerCallbackQuery(query.id, 'המעטפה לא נמצאה');
        return;
      }
      // A new envelope is not an approval: a spend waiting for "לאשר" keeps waiting.
      const updated = await updateSpend(spend.id, {
        category: target.name,
        envelope_id: target.envelopeId,
        envelope_type: target.type,
      });
      await redrawSpendMessage(chatId, messageId, spend);
      if (updated.status === 'confirmed' && target.name !== spend.category) {
        await announceToFamily(
          announcement(`✏️ הועבר ל${target.name}`, memberName(member), [`• ${spendLine(updated, isoDateInIsrael())}`]),
          chatId,
        );
      }
      await answerCallbackQuery(query.id, target.name);
      return;
    }
  }
}

/** The live spends a bot reply is about; just this one when it is not linked. */
async function messageSpends(spend: CashSpend): Promise<CashSpend[]> {
  if (spend.bot_message_id && spend.telegram_chat_id) {
    const rows = await spendsOfBotMessage(Number(spend.telegram_chat_id), Number(spend.bot_message_id));
    if (rows.length > 0) return rows;
  }
  const fresh = await getSpend(spend.id);
  return fresh && fresh.status !== 'deleted' ? [fresh] : [];
}

/** Put a spend's bot reply back as it is now: text, envelope and buttons. */
async function redrawSpendMessage(chatId: number, messageId: number, spend: CashSpend): Promise<void> {
  const rows = await messageSpends(spend);
  if (rows.length === 0) return;
  const members = await membersById();
  const who = members.get(rows[0]!.member_id);
  await editMessageText(
    chatId,
    messageId,
    savedMessage(rows, isoDateInIsrael(), who ? memberName(who) : ''),
    spendKeyboard(rows),
  );
}

async function sendBalance(chatId: number): Promise<void> {
  const [topups, spends, wallets, { data: transfers }] = await Promise.all([
    activeTopups(),
    allLiveSpends(),
    listWallets(),
    db().from('cash_transfers').select('*').eq('is_dismissed', false),
  ]);
  const state = walletState(topups, spends);
  const perWallet = walletBalances(wallets, topups, spends, (transfers ?? []) as CashTransfer[]);

  const verdict =
    state.unaccounted > 0
      ? `אמור להיות במזומן: <b>${formatIls(state.unaccounted)}</b>`
      : state.unaccounted === 0
        ? 'המזומן מאוזן בדיוק 🎯'
        : `רשמתם <b>${formatIls(Math.abs(state.unaccounted))}</b> יותר ממה שנכנס — כנראה חסרה משיכה או הכנסה.`;

  const walletLines =
    wallets.length > 1
      ? [
          '',
          '<b>לפי ארנק</b>',
          ...perWallet.map((b) => {
            const w = wallets.find((x) => x.id === b.walletId);
            return `• ${escapeHtml(w?.name ?? '')}${w?.is_default ? ' (ברירת מחדל)' : ''}: ${formatIls(b.balance)}`;
          }),
        ]
      : [];

  await sendMessage(
    chatId,
    [
      '<b>💰 מצב המזומן</b>',
      '',
      `נמשך מהבנק ונכנס: ${formatIls(state.toppedUp)} (${state.topupCount})`,
      `נרשם כהוצאה: ${formatIls(state.logged)} (${state.spendCount})`,
      '',
      verdict,
      ...walletLines,
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

  const [spends, members, envelopes] = await Promise.all([
    spendsBetween(from, to),
    membersById(),
    loadBotEnvelopes(month),
  ]);
  if (spends.length === 0) {
    await sendMessage(chatId, `אין הוצאות מזומן רשומות ב-${month}.`);
    return;
  }

  const total = spends.reduce((sum, s) => sum + Number(s.amount_ils), 0);
  // The same envelopes the dashboard shows, never RiseUp's raw labels.
  const byEnvelope = new Map<string, { total: number; count: number }>();
  for (const s of spends) {
    const name = envelopeOfSpend(s, envelopes).name;
    const row = byEnvelope.get(name) ?? { total: 0, count: 0 };
    row.total = Math.round((row.total + Number(s.amount_ils)) * 100) / 100;
    row.count += 1;
    byEnvelope.set(name, row);
  }
  const byCategory = [...byEnvelope.entries()]
    .map(([category, row]) => ({ category, ...row }))
    .sort((a, b) => b.total - a.total);
  const byMember = totalsByMember(spends);

  const memberLines = [...byMember.entries()].map(([memberId, amount]) => {
    const found = members.get(memberId);
    const name = found ? memberName(found) : 'לא ידוע';
    return `• ${escapeHtml(name)}: ${formatIls(amount)}`;
  });

  await sendMessage(
    chatId,
    [
      `<b>💸 מזומן ב-${month} · ${formatIls(total)}</b>`,
      '',
      '<b>לפי מעטפה</b>',
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
  const last = await lastCashRowForMember(member.id);
  if (!last) {
    await sendMessage(chatId, 'אין מה לבטל.');
    return;
  }

  const today = isoDateInIsrael();
  if (last.kind === 'spend') {
    await updateSpend(last.row.id, { status: 'deleted' });
    if (last.row.status === 'confirmed') {
      await announceToFamily(announcement('🗑 בוטל', memberName(member), [`• ${spendLine(last.row, today)}`]), chatId);
    }
    await sendMessage(
      chatId,
      `🗑 בוטל: ${formatIls(last.row.amount_ils)} · ${escapeHtml(last.row.category)} · ${friendlyDate(last.row.spent_at, today)}`,
    );
    return;
  }

  await dismissTopup(last.row.id);
  await announceToFamily(
    announcement('🗑 בוטל', memberName(member), [
      entryLine(Number(last.row.amount_ils), last.row.category, last.row.note, last.row.occurred_at, today),
    ]),
    chatId,
  );
  const what = last.row.source === 'manual' ? 'משיכה' : (last.row.category ?? 'הכנסה במזומן');
  await sendMessage(
    chatId,
    `🗑 בוטל: ${formatIls(Number(last.row.amount_ils))} · ${escapeHtml(what)} · ${friendlyDate(last.row.occurred_at, today)}`,
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
    lines.push(`משיכות חדשות מהכספומט: ${result.newTopups.length} — שאלתי לאיזה ארנק נכנס הכסף.`);
  }
  // Each new withdrawal's "which wallet?" question was sent by the sync itself.
  await sendMessage(chatId, lines.join('\n'));
}
