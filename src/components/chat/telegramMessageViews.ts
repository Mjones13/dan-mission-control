import type { TelegramMessage } from './useTelegramChatInbox';
import type { TelegramAgentMarkerState, TelegramAgentMessageMarkers } from './useTelegramAgentReadMarkers';
import { getTelegramAgentMessageMarkerState } from './useTelegramAgentReadMarkers';

export type TelegramMessageViewFilter = 'all' | 'unread' | 'starred';

export function isTelegramMessageStarredForView(markerState: Pick<TelegramAgentMarkerState, 'isStarred'>): boolean {
  return markerState.isStarred;
}

export function isTelegramMessageUnreadForMissionControl(
  message: Pick<TelegramMessage, 'isOutgoing'>,
  markerState: Pick<TelegramAgentMarkerState, 'isRead' | 'isStarred'>,
): boolean {
  return !message.isOutgoing && !markerState.isRead && !markerState.isStarred;
}

export function filterTelegramMessagesForView(
  messages: TelegramMessage[],
  filter: TelegramMessageViewFilter,
  getMarkerState: (messageId: number) => TelegramAgentMarkerState,
): TelegramMessage[] {
  if (filter === 'all') return messages;

  if (filter === 'starred') {
    return messages.filter((message) => isTelegramMessageStarredForView(getMarkerState(message.id)));
  }

  const loadedMessagesById = new Map(messages.map((message) => [message.id, message]));
  const unreadMessages = messages.filter((message) => isTelegramMessageUnreadForMissionControl(message, getMarkerState(message.id)));

  return unreadMessages.flatMap((message) => {
    const replyParent = message.replyToMessageId === null ? null : loadedMessagesById.get(message.replyToMessageId) || null;
    if (!replyParent?.isOutgoing) return [message];

    return [replyParent, message];
  });
}

export function filterTelegramMessagesForViewWithMarkers(
  messages: TelegramMessage[],
  chatId: string,
  filter: TelegramMessageViewFilter,
  markers: TelegramAgentMessageMarkers,
): TelegramMessage[] {
  return filterTelegramMessagesForView(
    messages,
    filter,
    (messageId) => getTelegramAgentMessageMarkerState(markers, chatId, messageId),
  );
}
