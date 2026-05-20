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

const BRIDGE_STATUS_PATTERNS = [
  // Keep this display-only list aligned with the Telegram unread status patterns.
  /^Brin(?:ing|ging)\.\.\./i,
  /^Tide\s*(?:pooling|pulling)\.\.\./i,
  /✉️\s*Message/,
  /🗺️\s*Update Plan/,
  /📖\s*Read:/,
  /🔧\s*(Exec|Tool|Edit|Patch):/,
];

export const RECENT_STATUS_MESSAGE_WINDOW = 3;

export function getTelegramChatEmoji(chat: Pick<TelegramChat, 'id' | 'title'>): string {
  return CHAT_EMOJI_BY_ID[chat.id] || CHAT_EMOJI_BY_TITLE[chat.title] || '💬';
}

export function isTelegramBridgeStatusText(text: string | null | undefined): boolean {
  if (!text) return false;
  return BRIDGE_STATUS_PATTERNS.some((pattern) => pattern.test(text));
}

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
