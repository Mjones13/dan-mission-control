import type { TelegramMessage } from './useTelegramChatInbox';

export type TelegramMessageViewFilter = 'all' | 'unread' | 'starred';

export interface TelegramMessageMarkerLookup {
  isMarkedRead(chatId: string, messageId: number): boolean;
  isStarred(chatId: string, messageId: number): boolean;
}

export interface DirectReplyJumpTarget {
  target: TelegramMessage;
  replyCount: number;
  label: string;
}

export function buildDirectReplyIndex(messages: TelegramMessage[]): Map<number, TelegramMessage[]> {
  const repliesByParentId = new Map<number, TelegramMessage[]>();

  for (const message of messages) {
    if (message.replyToMessageId === null) continue;
    const replies = repliesByParentId.get(message.replyToMessageId) || [];
    replies.push(message);
    repliesByParentId.set(message.replyToMessageId, replies);
  }

  repliesByParentId.forEach((replies) => {
    replies.sort((a: TelegramMessage, b: TelegramMessage) => a.id - b.id);
  });

  return repliesByParentId;
}

export function firstDirectReplyJumpTarget(messageId: number, replyIndex: Map<number, TelegramMessage[]>): DirectReplyJumpTarget | null {
  const replies = replyIndex.get(messageId) || [];
  const target = replies[0];
  if (!target) return null;

  return {
    target,
    replyCount: replies.length,
    label: replies.length === 1 ? 'Jump to newer reply' : `Jump to first of ${replies.length} loaded replies`,
  };
}

export function filterTelegramMessageViews(
  messages: TelegramMessage[],
  filter: TelegramMessageViewFilter,
  markerLookup: TelegramMessageMarkerLookup,
): TelegramMessage[] {
  if (filter === 'all') return messages;

  return messages.filter((message) => {
    if (filter === 'starred') return markerLookup.isStarred(message.chatId, message.id);
    if (message.isOutgoing) return false;
    // Local unread is intentionally independent from Telegram's server unread
    // count. Starred messages are local needs-attention items and stay in the
    // Starred view instead of competing with normal unread triage.
    return !markerLookup.isMarkedRead(message.chatId, message.id) && !markerLookup.isStarred(message.chatId, message.id);
  });
}

export function telegramMessageViewCounts(
  messages: TelegramMessage[],
  markerLookup: TelegramMessageMarkerLookup,
): Record<TelegramMessageViewFilter, number> {
  return {
    all: messages.length,
    unread: filterTelegramMessageViews(messages, 'unread', markerLookup).length,
    starred: filterTelegramMessageViews(messages, 'starred', markerLookup).length,
  };
}
