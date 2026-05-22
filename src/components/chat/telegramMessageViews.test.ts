import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDirectReplyIndex,
  filterTelegramMessageViews,
  firstDirectReplyJumpTarget,
  telegramMessageViewCounts,
  type TelegramMessageMarkerLookup,
} from './telegramMessageViews';
import type { TelegramMessage } from './useTelegramChatInbox';

function message(id: number, overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    id,
    chatId: 'chat-1',
    text: `message ${id}`,
    senderId: null,
    senderName: null,
    isOutgoing: false,
    reactionCount: 0,
    sentAt: new Date(id * 1000).toISOString(),
    replyToMessageId: null,
    editedAt: null,
    ...overrides,
  };
}

function markerLookup(readIds: number[] = [], starredIds: number[] = []): TelegramMessageMarkerLookup {
  return {
    isMarkedRead: (_chatId, messageId) => readIds.includes(messageId),
    isStarred: (_chatId, messageId) => starredIds.includes(messageId),
  };
}

test('filterTelegramMessageViews returns every loaded message for the all filter', () => {
  const messages = [message(1), message(2, { isOutgoing: true })];

  assert.equal(filterTelegramMessageViews(messages, 'all', markerLookup([1], [2])), messages);
});

test('filterTelegramMessageViews returns only incoming locally unread messages for unread', () => {
  const messages = [
    message(1),
    message(2),
    message(3, { isOutgoing: true }),
    message(4),
  ];

  assert.deepEqual(
    filterTelegramMessageViews(messages, 'unread', markerLookup([2], [4])).map((item) => item.id),
    [1],
  );
});

test('filterTelegramMessageViews keeps starred needs-attention messages in the starred filter', () => {
  const messages = [message(1), message(2, { isOutgoing: true }), message(3)];

  assert.deepEqual(
    filterTelegramMessageViews(messages, 'starred', markerLookup([1], [1, 2])).map((item) => item.id),
    [1, 2],
  );
});

test('telegramMessageViewCounts counts loaded local views without mutating messages', () => {
  const messages = [message(1), message(2), message(3, { isOutgoing: true }), message(4)];
  const original = [...messages];

  assert.deepEqual(telegramMessageViewCounts(messages, markerLookup([2], [4])), {
    all: 4,
    unread: 1,
    starred: 1,
  });
  assert.deepEqual(messages, original);
});

test('buildDirectReplyIndex groups direct child replies in ascending message id order', () => {
  const messages = [
    message(10),
    message(13, { replyToMessageId: 10 }),
    message(11, { replyToMessageId: 10 }),
    message(12, { replyToMessageId: 99 }),
  ];

  const index = buildDirectReplyIndex(messages);

  assert.deepEqual(index.get(10)?.map((item) => item.id), [11, 13]);
  assert.deepEqual(index.get(99)?.map((item) => item.id), [12]);
});

test('firstDirectReplyJumpTarget discloses deterministic first-of-many behavior', () => {
  const messages = [
    message(10),
    message(12, { replyToMessageId: 10 }),
    message(11, { replyToMessageId: 10 }),
  ];

  const target = firstDirectReplyJumpTarget(10, buildDirectReplyIndex(messages));

  assert.equal(target?.target.id, 11);
  assert.equal(target?.replyCount, 2);
  assert.equal(target?.label, 'Jump to first of 2 loaded replies');
});

test('firstDirectReplyJumpTarget returns a single-reply label for unambiguous children', () => {
  const target = firstDirectReplyJumpTarget(10, buildDirectReplyIndex([message(11, { replyToMessageId: 10 })]));

  assert.equal(target?.target.id, 11);
  assert.equal(target?.replyCount, 1);
  assert.equal(target?.label, 'Jump to newer reply');
});
