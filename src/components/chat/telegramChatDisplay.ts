import type { TelegramChat } from './useTelegramChatInbox';

const CHAT_EMOJI_BY_ID: Record<string, string> = {
  '-5112572436': '🐒',
  '-5015476421': '🐬',
  '-5245242051': '🦁',
};

const CHAT_EMOJI_BY_TITLE: Record<string, string> = {
  'Finn Work': '🐒',
  'Jace Work': '🐬',
  'Leo Fitness': '🦁',
};

export function getTelegramChatEmoji(chat: Pick<TelegramChat, 'id' | 'title'>): string {
  return CHAT_EMOJI_BY_ID[chat.id] || CHAT_EMOJI_BY_TITLE[chat.title] || '💬';
}
