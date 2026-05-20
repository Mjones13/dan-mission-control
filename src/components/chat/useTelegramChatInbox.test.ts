import assert from 'node:assert/strict';
import test from 'node:test';
import { latestAcknowledgedOutgoingMessageId, mergeTelegramMessages, type TelegramMessage } from './useTelegramChatInbox';

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

test('latestAcknowledgedOutgoingMessageId is monotonic for reacted outgoing messages', () => {
  const messages = [
    message(10, { isOutgoing: true, reactionCount: 1 }),
    message(12, { isOutgoing: true, reactionCount: 0 }),
    message(15, { isOutgoing: true, reactionCount: 2 }),
    message(20, { isOutgoing: false, reactionCount: 5 }),
  ];

  assert.equal(latestAcknowledgedOutgoingMessageId(messages), 15);
  assert.equal(latestAcknowledgedOutgoingMessageId(messages, 18), 18);
});

test('mergeTelegramMessages deduplicates by id and returns chronological order', () => {
  const merged = mergeTelegramMessages(
    [message(3, { text: 'old 3' }), message(5)],
    [message(4), message(3, { text: 'updated 3' })],
    'append',
  );

  assert.deepEqual(merged.map((item) => item.id), [3, 4, 5]);
  assert.equal(merged[0].text, 'updated 3');
});
