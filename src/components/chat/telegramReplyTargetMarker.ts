import type { TelegramMessage } from './useTelegramChatInbox';
import type { TelegramAgentMarkerState } from './useTelegramAgentReadMarkers';
import type { TelegramMessageViewFilter } from './telegramMessageViews';

export function getActiveReplyTargetId(
  replyingTo: TelegramMessage | null,
  threadReplyTarget: TelegramMessage | null,
): number | null {
  return (replyingTo || threadReplyTarget)?.id ?? null;
}

export function shouldShowReplyTargetMarker(
  messageId: number,
  activeReplyTargetId: number | null,
  markerDisplayState: TelegramAgentMarkerState['displayState'],
  activeMessageFilter: TelegramMessageViewFilter,
): boolean {
  return (
    activeMessageFilter !== 'unread' &&
    activeReplyTargetId === messageId &&
    markerDisplayState === 'none'
  );
}
