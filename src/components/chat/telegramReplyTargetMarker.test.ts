import assert from 'node:assert/strict';
import test from 'node:test';
import type { TelegramMessage } from './useTelegramChatInbox';
import { getActiveReplyTargetId, shouldShowReplyTargetMarker } from './telegramReplyTargetMarker';

function message(id: number): TelegramMessage {
  return {
    id,
    chatId: 'chat-1',
    text: `Message ${id}`,
    senderId: null,
    senderName: null,
    isOutgoing: false,
    reactionCount: 0,
    sentAt: new Date(1000 + id).toISOString(),
    replyToMessageId: null,
    editedAt: null,
  };
}

test('getActiveReplyTargetId prefers explicit composer reply target over thread target', () => {
  assert.equal(getActiveReplyTargetId(message(2), message(1)), 2);
  assert.equal(getActiveReplyTargetId(null, message(1)), 1);
  assert.equal(getActiveReplyTargetId(null, null), null);
});

test('shouldShowReplyTargetMarker only shows for the active empty marker outside unread triage', () => {
  assert.equal(shouldShowReplyTargetMarker(2, 2, 'none', 'all'), true);
  assert.equal(shouldShowReplyTargetMarker(2, 1, 'none', 'all'), false);
  assert.equal(shouldShowReplyTargetMarker(2, 2, 'read', 'all'), false);
  assert.equal(shouldShowReplyTargetMarker(2, 2, 'starred', 'all'), false);
  assert.equal(shouldShowReplyTargetMarker(2, 2, 'none', 'unread'), false);
  assert.equal(shouldShowReplyTargetMarker(2, 2, 'none', 'mine'), true);
});
