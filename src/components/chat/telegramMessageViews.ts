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

  return messages.filter((message) => {
    const markerState = getMarkerState(message.id);
    if (filter === 'starred') return isTelegramMessageStarredForView(markerState);
    return isTelegramMessageUnreadForMissionControl(message, markerState);
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
