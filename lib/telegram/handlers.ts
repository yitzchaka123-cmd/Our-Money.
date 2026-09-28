import { issueLoginCode } from '@/lib/auth/codes';
import { createSessionToken } from '@/lib/auth/session';
import { loadPlan, settlePlanOccurrence, skipPlanOccurrence } from '@/lib/cash/plan-store';
import { env } from '@/lib/env';
import { activeCategories } from '@/lib/intake/categories';
import { isoDateInIsrael, parseIntake } from '@/lib/intake/parse';
import {
  monthBounds,
  totalsByCategory,
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
} from '@/lib/telegram/format';
import type { TelegramMessage, TelegramUpdate } from '@/lib/telegram/types';
import { resolveEnvelopeForCategory } from '@/lib/cash/envelopes';
import {
  activeTopups,
  allLiveSpends,
  attachBotMessage,
  dismissTopup,
  envelopeRefsForMonth,
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
  updateAlreadyProcessed,
  updateSpend,
  type NewSpend,
} from '@/lib/db/queries';
import type { HouseholdMember } from '@/lib/types';

const HELP = [
  '<b>Our Money</b> — יומן המזומן שלנו 💸',
  '',
  'פשוט תכתבו או תקליטו מה הוצאתם, בעברית או באנגלית. אפשר להגיד גם מאיזה ארנק ("מהארנק של שרה"):',
  '• <i>"80 שקל בסופר"</i>',
  '• <i>"שילמתי 45 על מונית אתמול"</i>',
  '• <i>"120 במכולת ועוד 30 על קפה"</i>',
  '• <i>"קיבלתי 200 שקל מסבתא"</i> — הכנסה במזומן',
  '',
  '<b>פקודות</b>',
  '/balance — כמה מזומן אמור להיות בארנק, לפי ארנק',
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
    console.error('Transcription failed', error);
    await sendMessage(
      message.chat.id,
      '🎤 לא הצלחתי לתמלל את ההקלטה. אפשר להקליט שוב, או פשוט לכתוב — שום דבר לא נרשם.',
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

  const wallets = await listWallets();
  let parsed;
  try {
    parsed = await parseIntake(input, {
      speakerName: member.display_name,
      wallets: wallets.map((w) => w.name),
    });
  } catch (error) {
    // The detail is for the logs; the couple needs to know what to do.
    console.error('Intake parse failed', error);
    await sendMessage(chatId, '😕 לא הצלחתי לעבד את ההודעה כרגע. נסו לשלוח שוב בעוד רגע — שום דבר לא נרשם.');
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

  const expenses = parsed.entries.filter((e) => e.direction === 'expense');
  const incomes = parsed.entries.filter((e) => e.direction === 'income');
  const withdrawals = parsed.entries.filter((e) => e.direction === 'withdrawal');

  // Cash is filed into RiseUp's own envelopes, so it shows up in the same card
  // a card spend would. The pin is resolved now, against the entry's month,
  // the same way RiseUp files an uncategorised charge.
  const monthsNeeded = [...new Set(expenses.map((e) => e.spentAt.slice(0, 7)))];
  const refsByMonth = new Map(
    await Promise.all(monthsNeeded.map(async (m) => [m, await envelopeRefsForMonth(m)] as const)),
  );

  const defaultWallet = wallets.find((w) => w.is_default) ?? wallets[0] ?? null;
  const walletFor = (name: string | null) => (matchWalletByName(wallets, name) ?? defaultWallet)?.id ?? null;

  const rows: NewSpend[] = expenses.map((entry, index) => {
    const target = resolveEnvelopeForCategory(refsByMonth.get(entry.spentAt.slice(0, 7)) ?? [], entry.category);
    return {
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
      envelope_id: target?.envelopeId ?? null,
      envelope_type: target?.type ?? null,
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
      savedMessage(saved, today, member.display_name),
      spendKeyboard(saved),
    );
    await attachBotMessage(
      saved.map((s) => s.id),
      sent.message_id,
    );
  }

  const walletName = (id: string | null) =>
    wallets.length > 1 ? ` · ${escapeHtml(wallets.find((w) => w.id === id)?.name ?? '')}` : '';

  for (const t of savedIncomes) {
    await sendMessage(
      chatId,
      [
        `💵 נרשמה הכנסה במזומן · ${escapeHtml(member.display_name)}`,
        '',
        `• <b>${formatIls(Number(t.amount_ils))}</b> · ${escapeHtml(t.category ?? '')}${
          t.note ? ` — ${escapeHtml(t.note)}` : ''
        } · ${friendlyDate(t.occurred_at, today)}${walletName(t.wallet_id)}`,
      ].join('\n'),
      [[{ text: '🗑 מחיקה', callback_data: encodeCallback({ kind: 'delete_income', spendId: t.id }) }]],
    );
  }

  for (const t of savedWithdrawals) {
    await sendMessage(
      chatId,
      [
        `🏧 נרשמה משיכה · ${escapeHtml(member.display_name)}`,
        '',
        `• <b>${formatIls(Number(t.amount_ils))}</b> · ${friendlyDate(t.occurred_at, today)}${walletName(t.wallet_id)}`,
        '',
        'כשהמשיכה תופיע ברייזאפ היא תותאם לרישום הזה — היא לא תיספר פעמיים.',
      ].join('\n'),
      [[{ text: '🗑 מחיקה', callback_data: encodeCallback({ kind: 'delete_income', spendId: t.id }) }]],
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

  // Top-up actions (cash income, manual or detected withdrawals) act on
  // cash_topups, not on a spend.
  if (action.kind === 'delete_income' || action.kind === 'dismiss_topup') {
    const topup = await getTopup(action.spendId);
    if (!topup || topup.is_dismissed) {
      await answerCallbackQuery(query.id, 'הרישום כבר לא קיים');
      return;
    }
    await dismissTopup(topup.id);
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
      // A new category can mean a new envelope: re-resolve the pin against the
      // spend's own month, or the dashboard would keep it in the old card.
      const target = resolveEnvelopeForCategory(
        await envelopeRefsForMonth(spend.spent_at.slice(0, 7)),
        category,
      );
      const updated = await updateSpend(spend.id, {
        category,
        status: 'confirmed',
        confidence: 'high',
        envelope_id: target?.envelopeId ?? null,
        envelope_type: target?.type ?? null,
      });
      await editMessageText(chatId, messageId, `✅ עודכן\n\n• ${spendLine(updated, today)}`);
      await answerCallbackQuery(query.id, category);
      return;
    }
  }
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
  const last = await lastCashRowForMember(member.id);
  if (!last) {
    await sendMessage(chatId, 'אין מה לבטל.');
    return;
  }

  const today = isoDateInIsrael();
  if (last.kind === 'spend') {
    await updateSpend(last.row.id, { status: 'deleted' });
    await sendMessage(
      chatId,
      `🗑 בוטל: ${formatIls(last.row.amount_ils)} · ${escapeHtml(last.row.category)} · ${friendlyDate(last.row.spent_at, today)}`,
    );
    return;
  }

  await dismissTopup(last.row.id);
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

  await sendMessage(chatId, lines.join('\n'));
  await announceWithdrawals(chatId, result.newTopups);
}

/**
 * One message per newly detected withdrawal, each with a "not a withdrawal"
 * button: the detector matches on wording, and a false positive would
 * otherwise inflate the wallet forever.
 */
export async function announceWithdrawals(
  chatId: number,
  topups: { id: string; amount_ils: number | string; business_name: string | null; occurred_at: string }[],
): Promise<void> {
  const today = isoDateInIsrael();
  for (const topup of topups) {
    await sendMessage(
      chatId,
      `🏧 משיכה חדשה נוספה לארנק: <b>${formatIls(Number(topup.amount_ils))}</b> · ${escapeHtml(
        topup.business_name ?? 'משיכה',
      )} · ${friendlyDate(topup.occurred_at, today)}`,
      [[{ text: '↩️ זו לא משיכה', callback_data: encodeCallback({ kind: 'dismiss_topup', spendId: topup.id }) }]],
    );
  }
}
