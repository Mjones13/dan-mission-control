import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isTelegramMessageEnvelope,
  normalizeTelegramMessageEnvelope,
  normalizeTelegramMessageEnvelopeList,
  resolveTelegramMessageEnvelopes,
} from './messages';

const CHAT_ID = '-5112572436';

// Shared fixture for GramJS-like message envelopes. Tests override only the
// field under examination so each assertion stays focused on normalization
// behavior rather than full Telegram object construction.
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
  // Regression coverage for dev/HMR and duplicate-dependency scenarios: the
  // object has the fields GramJS gives us, but its constructor identity may not
  // equal this module's `Api.Message` constructor. The structural guard should
  // accept it instead of dropping visible messages from the chat.
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
  // Media-only Telegram messages are valid envelopes even when there is no
  // caption. Until Mission Control has richer attachment rendering, a clear
  // placeholder plus capability flags is safer than pretending the message is
  // missing.
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
  // These are all object-shaped Telegram responses, but they are not normal
  // user-message envelopes. Keeping them out prevents raw service actions or
  // unrelated peers from leaking through the text-message normalization path.
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
  // Reply/thread resolution needs two failure modes: an id can be fetched but
  // not represent renderable user text (`non_text`), or it can be absent from
  // GramJS results entirely (`missing`).
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
