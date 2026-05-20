import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_TELEGRAM_AGENT_READ_MARKERS_PER_CHAT,
  isTelegramAgentMessageMarkedRead,
  markTelegramAgentMessageRead,
  markTelegramAgentMessagesRead,
  parseTelegramAgentReadMarkers,
  replyParentReadMarkerIds,
  toggleTelegramAgentMessageRead,
  unmarkTelegramAgentMessageRead,
} from './useTelegramAgentReadMarkers';
import type { TelegramMessage } from './useTelegramChatInbox';

test('parseTelegramAgentReadMarkers resets malformed content to empty markers', () => {
  assert.deepEqual(parseTelegramAgentReadMarkers('not json'), {});
  assert.deepEqual(parseTelegramAgentReadMarkers(JSON.stringify([])), {});
  assert.deepEqual(parseTelegramAgentReadMarkers(JSON.stringify({ chat: ['1'] })), {});
});

test('markTelegramAgentMessageRead dedupes and keeps the newest 100 markers per chat', () => {
  const chatId = '-5112572436';
  let markers: Record<string, number[]> = { [chatId]: Array.from({ length: MAX_TELEGRAM_AGENT_READ_MARKERS_PER_CHAT }, (_, index) => index + 1) };

  markers = markTelegramAgentMessageRead(markers, chatId, 50);
  assert.equal(markers[chatId].length, MAX_TELEGRAM_AGENT_READ_MARKERS_PER_CHAT);
  assert.equal(markers[chatId].at(-1), 50);
  assert.equal(markers[chatId].filter((id) => id === 50).length, 1);

  markers = markTelegramAgentMessageRead(markers, chatId, 101);
  assert.equal(markers[chatId].length, MAX_TELEGRAM_AGENT_READ_MARKERS_PER_CHAT);
  assert.equal(markers[chatId][0], 2);
  assert.equal(markers[chatId].at(-1), 101);
});

test('toggleTelegramAgentMessageRead toggles marker presence without affecting other chats', () => {
  const chatId = '-5112572436';
  const otherChatId = '-5015476421';
  let markers: Record<string, number[]> = { [otherChatId]: [12] };

  markers = toggleTelegramAgentMessageRead(markers, chatId, 3065);
  assert.equal(isTelegramAgentMessageMarkedRead(markers, chatId, 3065), true);
  assert.deepEqual(markers[otherChatId], [12]);

  markers = toggleTelegramAgentMessageRead(markers, chatId, 3065);
  assert.equal(isTelegramAgentMessageMarkedRead(markers, chatId, 3065), false);
  assert.deepEqual(markers[otherChatId], [12]);
});

test('unmarkTelegramAgentMessageRead removes the selected marker id', () => {
  const markers = unmarkTelegramAgentMessageRead({ chat: [1, 2, 3] }, 'chat', 2);

  assert.deepEqual(markers.chat, [1, 3]);
});

test('markTelegramAgentMessagesRead only updates when explicit new parent ids are present', () => {
  const chatId = '-5112572436';
  const existing = { [chatId]: [1, 2] };

  assert.equal(markTelegramAgentMessagesRead(existing, chatId, []), existing);
  assert.equal(markTelegramAgentMessagesRead(existing, chatId, [2]), existing);

  const next = markTelegramAgentMessagesRead(existing, chatId, [2, 3, 3]);
  assert.deepEqual(next[chatId], [1, 2, 3]);
});

test('replyParentReadMarkerIds returns only incoming messages explicitly replied to by outgoing messages', () => {
  const base = (id: number, overrides: Partial<TelegramMessage> = {}): TelegramMessage => ({
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
  });

  const ids = replyParentReadMarkerIds([
    base(10),
    base(11, { isOutgoing: true }),
    base(20, { isOutgoing: true, replyToMessageId: 10 }),
    base(21, { isOutgoing: true, replyToMessageId: 11 }),
    base(22, { isOutgoing: true, replyToMessageId: 999 }),
    base(23, { isOutgoing: true, replyToMessageId: 10 }),
  ]);

  assert.deepEqual(ids, [10]);
});
