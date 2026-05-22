export type MessageListChange = 'append' | 'prepend' | 'mixed' | 'same' | 'replace';

export const LOOSE_NEAR_BOTTOM_THRESHOLD_PX = 80;
export const BOTTOM_LOCK_ENGAGE_THRESHOLD_PX = 24;
export const USER_SCROLL_AWAY_DELTA_PX = 1;

export function classifyMessageListChange(previousIds: number[], currentIds: number[]): MessageListChange {
  if (previousIds.length === 0 && currentIds.length === 0) return 'same';
  if (areSameMessageIds(previousIds, currentIds)) return 'same';
  if (previousIds.length === 0 || currentIds.length === 0) return 'replace';

  const previousInCurrentStart = findContiguousSubsequenceStart(currentIds, previousIds);
  if (previousInCurrentStart === 0 && currentIds.length > previousIds.length) return 'append';
  if (previousInCurrentStart > 0 && previousInCurrentStart + previousIds.length === currentIds.length) return 'prepend';
  if (previousInCurrentStart >= 0) return 'mixed';

  return 'replace';
}

export function appendedMessageCount(previousIds: number[], currentIds: number[]): number {
  const change = classifyMessageListChange(previousIds, currentIds);
  if (change !== 'append' && change !== 'mixed') return 0;
  const previousInCurrentStart = findContiguousSubsequenceStart(currentIds, previousIds);
  if (previousInCurrentStart < 0) return 0;
  return currentIds.length - (previousInCurrentStart + previousIds.length);
}

export function appendedMessages<T extends { id: number }>(previousIds: number[], currentMessages: T[]): T[] {
  const currentIds = currentMessages.map((message) => message.id);
  const change = classifyMessageListChange(previousIds, currentIds);
  if (change !== 'append' && change !== 'mixed') return [];
  const previousInCurrentStart = findContiguousSubsequenceStart(currentIds, previousIds);
  if (previousInCurrentStart < 0) return [];
  return currentMessages.slice(previousInCurrentStart + previousIds.length);
}

export function appendedActionableMessageCount<T extends { id: number }>(
  previousIds: number[],
  currentMessages: T[],
  isActionable: (message: T) => boolean,
): number {
  return appendedMessages(previousIds, currentMessages).filter(isActionable).length;
}

export function shouldRestoreOlderMessageAnchor(change: MessageListChange, loadOlderRequested: boolean): boolean {
  return loadOlderRequested && (change === 'prepend' || change === 'mixed');
}

export function getScrollBottom(scrollHeight: number, scrollTop: number, clientHeight: number): number {
  return scrollHeight - scrollTop - clientHeight;
}

export function isWithinBottomLockThreshold(distanceFromBottom: number): boolean {
  return distanceFromBottom <= BOTTOM_LOCK_ENGAGE_THRESHOLD_PX;
}

export function isWithinLooseNearBottomThreshold(distanceFromBottom: number): boolean {
  return distanceFromBottom < LOOSE_NEAR_BOTTOM_THRESHOLD_PX;
}

export function isUserScrollingAway(previousScrollTop: number, nextScrollTop: number): boolean {
  return nextScrollTop < previousScrollTop - USER_SCROLL_AWAY_DELTA_PX;
}

export function scrollTopForPreservedBottom(scrollHeight: number, scrollBottom: number, clientHeight: number): number {
  return scrollHeight - scrollBottom - clientHeight;
}

const TALL_TARGET_TOP_ALIGNMENT_THRESHOLD = 0.9;
const TALL_TARGET_TOP_PADDING_PX = 12;

export function scrollTopForCenteredElement(
  scrollTop: number,
  containerTop: number,
  containerHeight: number,
  targetTop: number,
  targetHeight: number,
): number {
  const targetOffset = targetHeight >= containerHeight * TALL_TARGET_TOP_ALIGNMENT_THRESHOLD
    ? TALL_TARGET_TOP_PADDING_PX
    : (containerHeight - targetHeight) / 2;

  return Math.max(0, scrollTop + targetTop - containerTop - targetOffset);
}

export function restoredScrollTopForHeightDelta(beforeScrollTop: number, beforeScrollHeight: number, afterScrollHeight: number): number {
  return beforeScrollTop + (afterScrollHeight - beforeScrollHeight);
}

function areSameMessageIds(previousIds: number[], currentIds: number[]) {
  return previousIds.length === currentIds.length && previousIds.every((id, index) => id === currentIds[index]);
}

function findContiguousSubsequenceStart(haystack: number[], needle: number[]) {
  if (needle.length > haystack.length) return -1;

  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let matches = true;
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[start + index] !== needle[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return start;
  }

  return -1;
}
