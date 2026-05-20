import assert from 'node:assert/strict';
import test from 'node:test';
import type { TelegramMessage } from './useTelegramChatInbox';
import {
  appendDirectThreadExtensions,
  createReplyContextLookup,
  createUnavailableReplyContextMessage,
  getInlineReplyPreview,
  inferTelegramChatActorLabel,
  latestLoadedThreadMessage,
  loadReplyContextBatch,
  resolvedMessageToContextMessage,
  shouldOfferThreadAction,
  telegramDisplaySenderLabel,
  toReplyContextMessage,
  type TelegramResolvedMessage,
} from './telegramReplyContext';

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

test('telegramDisplaySenderLabel omits outgoing labels and maps stable work chat names', () => {
  assert.equal(telegramDisplaySenderLabel(message(1, { isOutgoing: true }), 'Finn Work'), null);
  assert.equal(telegramDisplaySenderLabel(message(2), 'Finn Work'), 'Finn');
  assert.equal(telegramDisplaySenderLabel(message(3), 'Jace Work'), 'Jace');
  assert.equal(telegramDisplaySenderLabel(message(4), 'Leo Fitness'), 'Leo');
  assert.equal(telegramDisplaySenderLabel(message(5, { senderName: 'Actual Sender' }), 'Finn Work'), 'Actual Sender');
  assert.equal(telegramDisplaySenderLabel(message(6), 'General Chat'), null);
});

test('inferTelegramChatActorLabel recognizes current agent/work chats', () => {
  assert.equal(inferTelegramChatActorLabel('Finn Work'), 'Finn');
  assert.equal(inferTelegramChatActorLabel('Jace Work'), 'Jace');
  assert.equal(inferTelegramChatActorLabel('Leo Fitness'), 'Leo');
});

test('getInlineReplyPreview resolves reply parents from local cache first', () => {
  const parent = message(10, { text: 'parent text' });
  const child = message(11, { replyToMessageId: 10 });

  const preview = getInlineReplyPreview(child, [parent, child], {});

  assert.equal(preview?.id, 10);
  assert.equal(preview?.text, 'parent text');
  assert.equal(preview?.status, 'loaded');
});

test('getInlineReplyPreview uses resolved stale/missing parent fallback', () => {
  const child = message(11, { replyToMessageId: 10 });
  const missing = createUnavailableReplyContextMessage(10, 'chat-1', 'missing');

  const preview = getInlineReplyPreview(child, [child], { 10: missing });

  assert.equal(preview?.id, 10);
  assert.equal(preview?.status, 'missing');
  assert.match(preview?.text || '', /unavailable/);
});

test('loadReplyContextBatch loads parent ancestry in bounded batches', async () => {
  const messages = [
    message(1),
    message(2, { replyToMessageId: 1 }),
    message(3, { replyToMessageId: 2 }),
    message(4, { replyToMessageId: 3 }),
    message(5, { replyToMessageId: 4 }),
    message(6, { replyToMessageId: 5 }),
  ];
  const lookup = createReplyContextLookup(messages, {});

  const result = await loadReplyContextBatch(toReplyContextMessage(messages[5]), lookup, async (id) => {
    throw new Error(`unexpected resolve ${id}`);
  }, 5);

  assert.deepEqual(result.ancestors.map((item) => item.id), [1, 2, 3, 4, 5]);
  assert.equal(result.reachedRoot, true);
});

test('loadReplyContextBatch fetches parent of oldest known chain until root', async () => {
  const known = [message(5, { replyToMessageId: 4 }), message(6, { replyToMessageId: 5 })];
  const remote = new Map([
    [4, toReplyContextMessage(message(4, { replyToMessageId: 3 }))],
    [3, toReplyContextMessage(message(3))],
  ]);
  const lookup = createReplyContextLookup(known, {});

  const result = await loadReplyContextBatch(toReplyContextMessage(known[0]), lookup, async (id) => remote.get(id)!, 5);

  assert.deepEqual(result.ancestors.map((item) => item.id), [3, 4]);
  assert.equal(result.reachedRoot, true);
});

test('resolvedMessageToContextMessage preserves non-text fallback status', () => {
  const resolved: TelegramResolvedMessage = { id: 42, message: null, unavailableReason: 'non_text' };
  const contextMessage = resolvedMessageToContextMessage(resolved, 'chat-1');

  assert.equal(contextMessage.id, 42);
  assert.equal(contextMessage.status, 'non_text');
});

test('shouldOfferThreadAction covers parent replies and cached child replies', () => {
  const parent = message(1);
  const child = message(2, { replyToMessageId: 1 });

  assert.equal(shouldOfferThreadAction(child, [parent, child]), true);
  assert.equal(shouldOfferThreadAction(parent, [parent, child]), true);
});

test('latestLoadedThreadMessage selects newest visible loaded thread message for composer reply target', () => {
  const parent = toReplyContextMessage(message(1));
  const anchor = toReplyContextMessage(message(2, { replyToMessageId: 1 }));
  const sentFollowUp = toReplyContextMessage(message(3, { isOutgoing: true, replyToMessageId: 2 }));

  const target = latestLoadedThreadMessage([parent, anchor, sentFollowUp]);

  assert.equal(target?.id, 3);
  assert.equal(target?.replyToMessageId, 2);
});

test('latestLoadedThreadMessage skips unavailable messages when defaulting composer reply target', () => {
  const parent = toReplyContextMessage(message(1));
  const unavailable = createUnavailableReplyContextMessage(2, 'chat-1', 'missing');

  const target = latestLoadedThreadMessage([parent, unavailable]);

  assert.equal(target?.id, 1);
});

test('appendDirectThreadExtensions appends newly loaded replies that extend current visible chain', () => {
  const parent = message(1);
  const anchor = message(2, { replyToMessageId: 1 });
  const agentReply = message(3, { replyToMessageId: 2, text: 'agent follow-up' });

  const extended = appendDirectThreadExtensions(
    [toReplyContextMessage(parent), toReplyContextMessage(anchor)],
    [parent, anchor, agentReply],
  );

  assert.deepEqual(extended.map((item) => item.id), [1, 2, 3]);
  assert.equal(latestLoadedThreadMessage(extended)?.id, 3);
});

test('appendDirectThreadExtensions leaves ambiguous parallel direct replies for a later branch-discovery pass', () => {
  const parent = message(1);
  const anchor = message(2, { replyToMessageId: 1 });
  const firstBranch = message(3, { replyToMessageId: 2 });
  const secondBranch = message(4, { replyToMessageId: 2 });

  const extended = appendDirectThreadExtensions(
    [toReplyContextMessage(parent), toReplyContextMessage(anchor)],
    [parent, anchor, firstBranch, secondBranch],
  );

  assert.deepEqual(extended.map((item) => item.id), [1, 2]);
});
