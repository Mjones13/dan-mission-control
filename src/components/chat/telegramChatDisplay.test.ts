import assert from 'node:assert/strict';
import test from 'node:test';
import { isTelegramBridgeStatusMessage } from '@/lib/telegram/bridge-status';
import {
  getTelegramChatEmoji,
  isTelegramBridgeStatusText,
  RECENT_STATUS_MESSAGE_WINDOW,
  visibleTelegramMessages,
} from './telegramChatDisplay';
import type { TelegramMessage } from './useTelegramChatInbox';

function message(id: number, text: string): TelegramMessage {
  return {
    id,
    chatId: 'chat-1',
    text,
    senderId: null,
    senderName: null,
    isOutgoing: false,
    reactionCount: 0,
    sentAt: `2026-05-20T00:00:0${id}.000Z`,
    replyToMessageId: null,
    editedAt: null,
  };
}

test('getTelegramChatEmoji uses stable emoji symbols for known Mission Control chats by id', () => {
  assert.equal(getTelegramChatEmoji({ id: '-5112572436', title: 'Finn Work' }), '🐒');
  assert.equal(getTelegramChatEmoji({ id: '-5015476421', title: 'Jace Work' }), '🐬');
  assert.equal(getTelegramChatEmoji({ id: '-5245242051', title: 'Leo Fitness' }), '🦁');
});

test('getTelegramChatEmoji falls back to title matches when chat ids are unavailable or changed', () => {
  assert.equal(getTelegramChatEmoji({ id: 'unknown-finn-id', title: 'Finn Work' }), '🐒');
  assert.equal(getTelegramChatEmoji({ id: 'unknown-jace-id', title: 'Jace Work' }), '🐬');
  assert.equal(getTelegramChatEmoji({ id: 'unknown-leo-id', title: 'Leo Fitness' }), '🦁');
});

test('getTelegramChatEmoji uses known agent icons for new Mission Control chat titles', () => {
  assert.equal(getTelegramChatEmoji({ id: 'unknown-atlas-id', title: 'Atlas Work' }), '🌎');
  assert.equal(getTelegramChatEmoji({ id: 'unknown-feynman-id', title: 'Feynman Notes' }), '📚');
  assert.equal(getTelegramChatEmoji({ id: 'unknown-forge-id', title: 'Forge Work' }), '🏗️');
  assert.equal(getTelegramChatEmoji({ id: 'unknown-marshal-id', title: 'Marshal Work' }), '🎖️');
  assert.equal(getTelegramChatEmoji({ id: 'unknown-canary-id', title: 'Canary Work' }), '🐤');
  assert.equal(getTelegramChatEmoji({ id: 'unknown-harbor-id', title: 'Harbor Work' }), '🛳️');
});

test('getTelegramChatEmoji uses the generic chat bubble for unknown chats', () => {
  assert.equal(getTelegramChatEmoji({ id: 'other', title: 'Other Group' }), '💬');
});

test('isTelegramBridgeStatusText reuses the shared Telegram bridge status matcher', () => {
  assert.equal(isTelegramBridgeStatusText, isTelegramBridgeStatusMessage);
});

test('isTelegramBridgeStatusText matches known low-value bridge status patterns', () => {
  for (const text of [
    'Brining...',
    'Bringing...',
    'Tidepooling...',
    'Tide pulling...',
    '✉️ Message',
    '🗺️ Update Plan',
    '📖 Read: docs/example.md',
    '🔧 Exec: npm test',
    '🔧 Tool: read',
    '🔧 Edit: src/file.ts',
    '🔧 Patch: update',
  ]) {
    assert.equal(isTelegramBridgeStatusText(text), true, text);
  }
});

test('isTelegramBridgeStatusText does not match normal human text or empty text', () => {
  for (const text of [
    'Can you take a look at this?',
    'Message me when ready',
    'Read: I liked that paragraph',
    '',
    null,
    undefined,
  ]) {
    assert.equal(isTelegramBridgeStatusText(text), false, String(text));
  }
});

test('visibleTelegramMessages hides matching statuses older than the newest window', () => {
  const messages = [
    message(1, 'Brining...'),
    message(2, 'Normal older context'),
    message(3, 'Another normal message'),
    message(4, 'Newest normal one'),
    message(5, 'Newest normal two'),
    message(6, 'Newest normal three'),
  ];

  assert.deepEqual(
    visibleTelegramMessages(messages).map((item) => item.id),
    [2, 3, 4, 5, 6],
  );
});

test('visibleTelegramMessages keeps matching statuses inside the newest window', () => {
  const messages = [
    message(1, 'Normal older context'),
    message(2, 'Tidepooling...'),
    message(3, 'Newest normal one'),
    message(4, 'Newest normal two'),
    message(5, 'Newest normal three'),
    message(6, 'Newest normal four'),
  ];

  assert.deepEqual(
    visibleTelegramMessages(messages).map((item) => item.id),
    [1, 2, 3, 4, 5, 6],
  );
});

test('visibleTelegramMessages keeps normal messages regardless of age', () => {
  const messages = [
    message(1, 'A very old normal message'),
    message(2, 'Bringing...'),
    message(3, 'Recent normal one'),
    message(4, 'Recent normal two'),
    message(5, 'Recent normal three'),
    message(6, 'Recent normal four'),
    message(7, 'Recent normal five'),
  ];

  assert.deepEqual(
    visibleTelegramMessages(messages).map((item) => item.id),
    [1, 3, 4, 5, 6, 7],
  );
});

test('visibleTelegramMessages protects all messages when the list fits in the recent window', () => {
  const messages = [
    message(1, 'Brining...'),
    message(2, 'Tidepooling...'),
    message(3, '📖 Read: source'),
    message(4, '🔧 Tool: read'),
    message(5, '🗺️ Update Plan'),
  ];

  assert.equal(RECENT_STATUS_MESSAGE_WINDOW, 5);
  assert.deepEqual(
    visibleTelegramMessages(messages).map((item) => item.id),
    [1, 2, 3, 4, 5],
  );
});

test('visibleTelegramMessages returns a derived list without mutating raw input', () => {
  const messages = [
    message(1, '🔧 Tool: read'),
    message(2, 'Normal older context'),
    message(3, 'Recent normal one'),
    message(4, 'Recent normal two'),
    message(5, 'Recent normal three'),
    message(6, 'Recent normal four'),
  ];
  const originalIds = messages.map((item) => item.id);
  const originalObjects = [...messages];

  const visible = visibleTelegramMessages(messages);

  assert.notEqual(visible, messages);
  assert.deepEqual(messages.map((item) => item.id), originalIds);
  assert.deepEqual(messages, originalObjects);
  assert.equal(messages.length, 6);
  assert.deepEqual(visible.map((item) => item.id), [2, 3, 4, 5, 6]);
});
