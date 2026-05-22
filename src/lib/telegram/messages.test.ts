import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isTelegramMessageEnvelope,
  normalizeTelegramMessageEnvelope,
  normalizeTelegramMessageEnvelopeList,
  resolveTelegramMessageEnvelopes,
} from './messages';

const CHAT_ID = '-5112572436';

function messageEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    className: 'Message',
    message: 'hello',
    date: 1_700_000_000,
    senderId: 12345,
    out: false,
    reactions: { results: [{ count: 2 }, { count: 3 }] },
    replyTo: { replyToMsgId: 99 },
    editDate: 1_700_000_100,
    ...overrides,
  };
}

test('normalizes a Telegram message envelope with text and allowlisted fields', () => {
  const normalized = normalizeTelegramMessageEnvelope(messageEnvelope(), CHAT_ID);

  assert.deepEqual(normalized, {
    id: 101,
    chatId: CHAT_ID,
    text: 'hello',
    senderId: '12345',
    senderName: null,
    isOutgoing: false,
    reactionCount: 5,
    sentAt: '2023-11-14T22:13:20.000Z',
    replyToMessageId: 99,
    editedAt: '2023-11-14T22:15:00.000Z',
  });
});

test('accepts a cross-constructor GramJS-like VirtualClass envelope where instanceof would be brittle', () => {
  const envelope = messageEnvelope({
    className: undefined,
    constructor: { name: 'VirtualClass' },
    id: 102,
    message: 'from another module identity',
  });

  assert.equal(isTelegramMessageEnvelope(envelope), true);
  assert.equal(normalizeTelegramMessageEnvelope(envelope, CHAT_ID)?.text, 'from another module identity');
});

test('does not silently drop a media envelope solely because text is empty', () => {
  const normalized = normalizeTelegramMessageEnvelope(messageEnvelope({
    id: 103,
    message: '',
    media: { className: 'MessageMediaPhoto' },
    entities: [{ className: 'MessageEntityTextUrl' }],
  }), CHAT_ID);

  assert.equal(normalized?.text, '[Unsupported Telegram media]');
  assert.equal(normalized?.hasMedia, true);
  assert.equal(normalized?.mediaKind, 'MessageMediaPhoto');
  assert.equal(normalized?.hasEntities, true);
});

test('preserves captions on media envelopes', () => {
  const normalized = normalizeTelegramMessageEnvelope(messageEnvelope({
    id: 104,
    message: 'photo caption',
    media: { className: 'MessageMediaPhoto' },
  }), CHAT_ID);

  assert.equal(normalized?.text, 'photo caption');
  assert.equal(normalized?.hasMedia, true);
});

test('rejects service, deleted, and bad non-message shapes safely', () => {
  assert.equal(normalizeTelegramMessageEnvelope(messageEnvelope({ className: 'MessageService', action: { className: 'MessageActionChatAddUser' } }), CHAT_ID), null);
  assert.equal(normalizeTelegramMessageEnvelope({ id: 1, className: 'MessageEmpty' }, CHAT_ID), null);
  assert.equal(normalizeTelegramMessageEnvelope({ id: '1', className: 'Message', message: 'bad id' }, CHAT_ID), null);
  assert.equal(normalizeTelegramMessageEnvelope({ id: 2, className: 'PeerChannel', message: 'not a message' }, CHAT_ID), null);
});

test('normalizes message lists while preserving caller-controlled order', () => {
  const messages = normalizeTelegramMessageEnvelopeList([
    messageEnvelope({ id: 1, message: 'first' }),
    { id: 2, className: 'MessageService', action: {} },
    messageEnvelope({ id: 3, message: 'third' }),
  ], CHAT_ID);

  assert.deepEqual(messages.map((message) => message.id), [1, 3]);
});

test('resolve helper returns found messages under structural guard and distinguishes non-text from missing', () => {
  const resolved = resolveTelegramMessageEnvelopes(CHAT_ID, [101, 102, 103], [
    messageEnvelope({ id: 101, message: 'found through structural guard', constructor: { name: 'VirtualClass' } }),
    { id: 102, className: 'MessageService', action: { className: 'MessageActionHistoryClear' } },
  ]);

  assert.equal(resolved[0].id, 101);
  assert.equal(resolved[0].message?.text, 'found through structural guard');
  assert.equal(resolved[0].unavailableReason, undefined);
  assert.deepEqual(resolved[1], { id: 102, message: null, unavailableReason: 'non_text' });
  assert.deepEqual(resolved[2], { id: 103, message: null, unavailableReason: 'missing' });
});
