import { isTelegramBridgeStatusMessage } from '@/lib/telegram/bridge-status';
import type { TelegramChat, TelegramMessage } from './useTelegramChatInbox';

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

export const RECENT_STATUS_MESSAGE_WINDOW = 5;

export function getTelegramChatEmoji(chat: Pick<TelegramChat, 'id' | 'title'>): string {
  return CHAT_EMOJI_BY_ID[chat.id] || CHAT_EMOJI_BY_TITLE[chat.title] || '💬';
}

export function visibleTelegramMessages(
  messages: TelegramMessage[],
  recentWindow = RECENT_STATUS_MESSAGE_WINDOW,
): TelegramMessage[] {
  const normalizedRecentWindow = Math.max(recentWindow, 0);
  const protectedStartIndex = Math.max(messages.length - normalizedRecentWindow, 0);

  return messages.filter((message, index) => {
    // Preserve the newest raw messages even when they look like bridge statuses.
    // That keeps live agent progress visible briefly while clearing stale noise
    // from older transcript history.
    const isInsideRecentWindow = index >= protectedStartIndex;
    return isInsideRecentWindow || !isTelegramBridgeStatusMessage(message.text);
  });
}
