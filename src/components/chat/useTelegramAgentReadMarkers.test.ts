import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_TELEGRAM_AGENT_MARKERS_PER_CHAT,
  clearTelegramAgentMessageMarkers,
  cycleTelegramAgentMessageMarker,
  getTelegramAgentMessageMarkerState,
  isTelegramAgentMessageMarkedRead,
  isTelegramAgentMessageStarred,
  markTelegramAgentMessageRead,
  markTelegramAgentMessageReadAndStarred,
  markTelegramAgentMessageStarred,
  markTelegramAgentMessagesRead,
  parseTelegramAgentMessageMarkers,
  parseTelegramAgentReadMarkers,
  replyParentReadMarkerIds,
  toggleTelegramAgentMessageRead,
  unmarkTelegramAgentMessageRead,
  type TelegramAgentMessageMarkers,
} from './useTelegramAgentReadMarkers';
import type { TelegramMessage } from './useTelegramChatInbox';

const emptyMarkers = (): TelegramAgentMessageMarkers => ({ read: {}, starred: {} });

test('parseTelegramAgentReadMarkers resets malformed v1 content to empty markers', () => {
  assert.deepEqual(parseTelegramAgentReadMarkers('not json'), {});
  assert.deepEqual(parseTelegramAgentReadMarkers(JSON.stringify([])), {});
  assert.deepEqual(parseTelegramAgentReadMarkers(JSON.stringify({ chat: ['1'] })), {});
});

test('parseTelegramAgentMessageMarkers parses valid v2 read and starred sections', () => {
  const markers = parseTelegramAgentMessageMarkers(JSON.stringify({
    read: { '-5112572436': [1, 2] },
    starred: { '-5112572436': [2], '-5015476421': [] },
  }));

  assert.deepEqual(markers, {
    read: { '-5112572436': [1, 2] },
    starred: { '-5112572436': [2], '-5015476421': [] },
  });
});

test('parseTelegramAgentMessageMarkers migrates missing v2 from valid v1 read markers', () => {
  const markers = parseTelegramAgentMessageMarkers(null, JSON.stringify({ '-5112572436': [3065, 3066] }));

  assert.deepEqual(markers, {
    read: { '-5112572436': [3065, 3066] },
    starred: {},
  });
});

test('parseTelegramAgentMessageMarkers resets malformed v2 content to empty markers', () => {
  assert.deepEqual(parseTelegramAgentMessageMarkers('not json'), emptyMarkers());
  assert.deepEqual(parseTelegramAgentMessageMarkers(JSON.stringify([])), emptyMarkers());
  assert.deepEqual(parseTelegramAgentMessageMarkers(JSON.stringify({ read: { chat: ['1'] }, starred: {} })), emptyMarkers());
  assert.deepEqual(parseTelegramAgentMessageMarkers(JSON.stringify({ read: {}, starred: [] })), emptyMarkers());
});

test('parseTelegramAgentMessageMarkers normalizes missing v2 sections to empty sections', () => {
  assert.deepEqual(parseTelegramAgentMessageMarkers(JSON.stringify({ read: { chat: [1] } })), {
    read: { chat: [1] },
    starred: {},
  });
});

test('markTelegramAgentMessageRead dedupes and keeps the newest 100 read markers per chat', () => {
  const chatId = '-5112572436';
  let markers: TelegramAgentMessageMarkers = {
    read: { [chatId]: Array.from({ length: MAX_TELEGRAM_AGENT_MARKERS_PER_CHAT }, (_, index) => index + 1) },
    starred: {},
  };

  markers = markTelegramAgentMessageRead(markers, chatId, 50);
  assert.equal(markers.read[chatId].length, MAX_TELEGRAM_AGENT_MARKERS_PER_CHAT);
  assert.equal(markers.read[chatId].at(-1), 50);
  assert.equal(markers.read[chatId].filter((id) => id === 50).length, 1);

  markers = markTelegramAgentMessageRead(markers, chatId, 101);
  assert.equal(markers.read[chatId].length, MAX_TELEGRAM_AGENT_MARKERS_PER_CHAT);
  assert.equal(markers.read[chatId][0], 2);
  assert.equal(markers.read[chatId].at(-1), 101);
});

test('markTelegramAgentMessageStarred dedupes and keeps the newest 100 starred markers per chat', () => {
  const chatId = '-5112572436';
  let markers: TelegramAgentMessageMarkers = {
    read: {},
    starred: { [chatId]: Array.from({ length: MAX_TELEGRAM_AGENT_MARKERS_PER_CHAT }, (_, index) => index + 1) },
  };

  markers = markTelegramAgentMessageStarred(markers, chatId, 25);
  assert.equal(markers.starred[chatId].length, MAX_TELEGRAM_AGENT_MARKERS_PER_CHAT);
  assert.equal(markers.starred[chatId].at(-1), 25);
  assert.equal(markers.starred[chatId].filter((id) => id === 25).length, 1);

  markers = markTelegramAgentMessageStarred(markers, chatId, 101);
  assert.equal(markers.starred[chatId].length, MAX_TELEGRAM_AGENT_MARKERS_PER_CHAT);
  assert.equal(markers.starred[chatId][0], 2);
  assert.equal(markers.starred[chatId].at(-1), 101);
});

test('cycleTelegramAgentMessageMarker cycles none to read-only', () => {
  const markers = cycleTelegramAgentMessageMarker(emptyMarkers(), 'chat', 3065);

  assert.equal(isTelegramAgentMessageMarkedRead(markers, 'chat', 3065), true);
  assert.equal(isTelegramAgentMessageStarred(markers, 'chat', 3065), false);
});

test('cycleTelegramAgentMessageMarker cycles read-only to read and starred', () => {
  const markers = cycleTelegramAgentMessageMarker({ read: { chat: [3065] }, starred: {} }, 'chat', 3065);

  assert.equal(isTelegramAgentMessageMarkedRead(markers, 'chat', 3065), true);
  assert.equal(isTelegramAgentMessageStarred(markers, 'chat', 3065), true);
});

test('cycleTelegramAgentMessageMarker cycles read and starred to none', () => {
  const markers = cycleTelegramAgentMessageMarker({ read: { chat: [3065] }, starred: { chat: [3065] } }, 'chat', 3065);

  assert.equal(isTelegramAgentMessageMarkedRead(markers, 'chat', 3065), false);
  assert.equal(isTelegramAgentMessageStarred(markers, 'chat', 3065), false);
});

test('cycleTelegramAgentMessageMarker clears the starred-only edge state', () => {
  const markers = cycleTelegramAgentMessageMarker({ read: {}, starred: { chat: [3065] } }, 'chat', 3065);

  assert.equal(isTelegramAgentMessageMarkedRead(markers, 'chat', 3065), false);
  assert.equal(isTelegramAgentMessageStarred(markers, 'chat', 3065), false);
});

test('getTelegramAgentMessageMarkerState gives starred display priority over read', () => {
  assert.deepEqual(getTelegramAgentMessageMarkerState({ read: { chat: [1] }, starred: { chat: [1] } }, 'chat', 1), {
    isRead: true,
    isStarred: true,
    displayState: 'starred',
  });
});

test('markTelegramAgentMessageRead sets read only and preserves an existing starred marker', () => {
  const markers = markTelegramAgentMessageRead({ read: {}, starred: { chat: [1] } }, 'chat', 1);

  assert.deepEqual(markers, { read: { chat: [1] }, starred: { chat: [1] } });
});

test('markTelegramAgentMessageReadAndStarred marks a message as handled and starred in one step', () => {
  const markers = markTelegramAgentMessageReadAndStarred({ read: { other: [2] }, starred: {} }, 'chat', 1);

  assert.deepEqual(markers, { read: { other: [2], chat: [1] }, starred: { chat: [1] } });
});

test('clearTelegramAgentMessageMarkers removes the selected id from both lists without affecting other chats', () => {
  const markers = clearTelegramAgentMessageMarkers({
    read: { chat: [1, 2, 3], other: [2] },
    starred: { chat: [2, 4], other: [2] },
  }, 'chat', 2);

  assert.deepEqual(markers, {
    read: { chat: [1, 3], other: [2] },
    starred: { chat: [4], other: [2] },
  });
});

test('toggleTelegramAgentMessageRead follows the message marker cycle without affecting other chats', () => {
  const chatId = '-5112572436';
  const otherChatId = '-5015476421';
  let markers: TelegramAgentMessageMarkers = { read: { [otherChatId]: [12] }, starred: {} };

  markers = toggleTelegramAgentMessageRead(markers, chatId, 3065);
  assert.equal(isTelegramAgentMessageMarkedRead(markers, chatId, 3065), true);
  assert.deepEqual(markers.read[otherChatId], [12]);

  markers = toggleTelegramAgentMessageRead(markers, chatId, 3065);
  assert.equal(isTelegramAgentMessageStarred(markers, chatId, 3065), true);
  assert.deepEqual(markers.read[otherChatId], [12]);

  markers = toggleTelegramAgentMessageRead(markers, chatId, 3065);
  assert.equal(isTelegramAgentMessageMarkedRead(markers, chatId, 3065), false);
  assert.equal(isTelegramAgentMessageStarred(markers, chatId, 3065), false);
  assert.deepEqual(markers.read[otherChatId], [12]);
});

test('unmarkTelegramAgentMessageRead removes the selected read id and preserves starred markers', () => {
  const markers = unmarkTelegramAgentMessageRead({ read: { chat: [1, 2, 3] }, starred: { chat: [2] } }, 'chat', 2);

  assert.deepEqual(markers, { read: { chat: [1, 3] }, starred: { chat: [2] } });
});

test('markTelegramAgentMessagesRead only updates read markers when explicit new parent ids are present', () => {
  const chatId = '-5112572436';
  const existing: TelegramAgentMessageMarkers = { read: { [chatId]: [1, 2] }, starred: { [chatId]: [2] } };

  assert.equal(markTelegramAgentMessagesRead(existing, chatId, []), existing);
  assert.equal(markTelegramAgentMessagesRead(existing, chatId, [2]), existing);

  const next = markTelegramAgentMessagesRead(existing, chatId, [2, 3, 3]);
  assert.deepEqual(next.read[chatId], [1, 2, 3]);
  assert.deepEqual(next.starred[chatId], [2]);
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
