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

export const RECENT_STATUS_MESSAGE_WINDOW = 3;

export function getTelegramChatEmoji(chat: Pick<TelegramChat, 'id' | 'title'>): string {
  return CHAT_EMOJI_BY_ID[chat.id] || CHAT_EMOJI_BY_TITLE[chat.title] || '💬';
}

export const isTelegramBridgeStatusText = isTelegramBridgeStatusMessage;

function messageNewestSortValue(message: TelegramMessage): number {
  const sentAt = Date.parse(message.sentAt);
  return Number.isFinite(sentAt) ? sentAt : message.id;
}

export function visibleTelegramMessages(
  messages: TelegramMessage[],
  recentWindow = RECENT_STATUS_MESSAGE_WINDOW,
): TelegramMessage[] {
  const protectedMessageIds = new Set(
    [...messages]
      .sort((a, b) => {
        const bySentAt = messageNewestSortValue(b) - messageNewestSortValue(a);
        return bySentAt || b.id - a.id;
      })
      .slice(0, Math.max(recentWindow, 0))
      .map((message) => message.id),
  );

  return messages.filter((message) => (
    protectedMessageIds.has(message.id) || !isTelegramBridgeStatusText(message.text)
  ));
}
