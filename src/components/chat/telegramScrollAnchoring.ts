export type MessageListChange = 'append' | 'prepend' | 'mixed' | 'same' | 'replace';

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

export function shouldRestoreOlderMessageAnchor(change: MessageListChange, loadOlderRequested: boolean): boolean {
  return loadOlderRequested && (change === 'prepend' || change === 'mixed');
}

export function getScrollBottom(scrollHeight: number, scrollTop: number, clientHeight: number): number {
  return scrollHeight - scrollTop - clientHeight;
}

export function scrollTopForPreservedBottom(scrollHeight: number, scrollBottom: number, clientHeight: number): number {
  return scrollHeight - scrollBottom - clientHeight;
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
