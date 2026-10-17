export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio extends TelegramVoice {
  file_name?: string;
}

/** One size of a photo; Telegram sends several, smallest first. Always JPEG. */
export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

/** A file sent "as a file" (uncompressed), e.g. a sharp photo of a receipt. */
export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  voice?: TelegramVoice;
  audio?: TelegramAudio;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  entities?: { type: string; offset: number; length: number }[];
  reply_to_message?: TelegramMessage;
  /** Service message: people (or the bot) added to a group. */
  new_chat_members?: TelegramUser[];
  /** Service message: a group became a supergroup, which changes its id. */
  migrate_to_chat_id?: number;
}

/** A change in the bot's own membership of a chat (added, removed, promoted). */
export interface TelegramChatMemberUpdated {
  chat: TelegramChat;
  from: TelegramUser;
  date: number;
  old_chat_member: { status: string; user: TelegramUser };
  new_chat_member: { status: string; user: TelegramUser };
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  my_chat_member?: TelegramChatMemberUpdated;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export type InlineKeyboard = InlineKeyboardButton[][];

/** A button that opens a link (e.g. "add the bot to a group"). */
export interface LinkButton {
  text: string;
  url: string;
}

export type LinkKeyboard = LinkButton[][];
