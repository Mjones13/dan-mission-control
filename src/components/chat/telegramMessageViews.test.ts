import assert from 'node:assert/strict';
import test from 'node:test';
import type { TelegramMessage } from './useTelegramChatInbox';
import type { TelegramAgentMessageMarkers } from './useTelegramAgentReadMarkers';
import { filterTelegramMessagesForViewWithMarkers, isTelegramMessageUnreadForMissionControl } from './telegramMessageViews';

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

const markers: TelegramAgentMessageMarkers = {
  read: { 'chat-1': [2], 'chat-2': [1] },
  starred: { 'chat-1': [3] },
};

test('filterTelegramMessagesForViewWithMarkers leaves all visible messages unchanged for the all view', () => {
  const messages = [message(1), message(2), message(3)];

  assert.equal(filterTelegramMessagesForViewWithMarkers(messages, 'chat-1', 'all', markers), messages);
});

test('filterTelegramMessagesForViewWithMarkers returns only current-chat starred messages', () => {
  const messages = [message(1), message(2), message(3), message(4)];

  assert.deepEqual(
    filterTelegramMessagesForViewWithMarkers(messages, 'chat-1', 'starred', markers).map((item) => item.id),
    [3],
  );
});

test('filterTelegramMessagesForViewWithMarkers returns incoming locally unhandled messages for unread', () => {
  const messages = [
    message(1),
    message(2),
    message(3),
    message(4, { isOutgoing: true }),
    message(5),
  ];

  assert.deepEqual(
    filterTelegramMessagesForViewWithMarkers(messages, 'chat-1', 'unread', markers).map((item) => item.id),
    [1, 5],
  );
});

test('filterTelegramMessagesForViewWithMarkers excludes bridge status noise from unread', () => {
  const messages = [
    message(1, { text: 'Brining...' }),
    message(2, { text: '🔧 Tool: read' }),
    message(3, { text: 'Normal human follow-up' }),
  ];

  assert.deepEqual(
    filterTelegramMessagesForViewWithMarkers(messages, 'chat-1', 'unread', { read: {}, starred: {} }).map((item) => item.id),
    [3],
  );
});

test('filterTelegramMessagesForViewWithMarkers pairs M Jones-authored loaded reply parents immediately before unread replies', () => {
  const messages = [
    message(1, { isOutgoing: true }),
    message(2, { isOutgoing: true }),
    message(3, { replyToMessageId: 1 }),
    message(4, { replyToMessageId: 99 }),
    message(5, { isOutgoing: true, replyToMessageId: 3 }),
  ];

  assert.deepEqual(
    filterTelegramMessagesForViewWithMarkers(messages, 'chat-1', 'unread', { read: {}, starred: {} }).map((item) => item.id),
    [1, 3, 4],
  );
});

test('filterTelegramMessagesForViewWithMarkers excludes non-M-Jones reply parents from unread context', () => {
  const messages = [
    message(1),
    message(2, { replyToMessageId: 1 }),
  ];

  assert.deepEqual(
    filterTelegramMessagesForViewWithMarkers(messages, 'chat-1', 'unread', { read: { 'chat-1': [1] }, starred: {} }).map((item) => item.id),
    [2],
  );
});

test('filterTelegramMessagesForViewWithMarkers orders unread messages chronologically while pairing local parents', () => {
  const messages = [
    message(1, { isOutgoing: true }),
    message(2, { replyToMessageId: 1 }),
    message(3, { replyToMessageId: 4 }),
    message(4, { isOutgoing: true }),
    message(5, { isOutgoing: true }),
    message(6, { replyToMessageId: 5 }),
  ];

  assert.deepEqual(
    filterTelegramMessagesForViewWithMarkers(messages, 'chat-1', 'unread', { read: {}, starred: {} }).map((item) => item.id),
    [1, 2, 4, 3, 5, 6],
  );
});

test('isTelegramMessageUnreadForMissionControl treats read and starred messages as handled', () => {
  assert.equal(isTelegramMessageUnreadForMissionControl(message(1), { isRead: false, isStarred: false }), true);
  assert.equal(isTelegramMessageUnreadForMissionControl(message(2), { isRead: true, isStarred: false }), false);
  assert.equal(isTelegramMessageUnreadForMissionControl(message(3), { isRead: false, isStarred: true }), false);
  assert.equal(isTelegramMessageUnreadForMissionControl(message(4, { isOutgoing: true }), { isRead: false, isStarred: false }), false);
});
