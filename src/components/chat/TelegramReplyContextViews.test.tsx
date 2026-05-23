import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TelegramReplyContextMessage } from './telegramReplyContext';
import type { TelegramMessage } from './useTelegramChatInbox';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function message(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    id: 1,
    chatId: 'chat-1',
    text: 'Parent reply preview text that should stay on one compact line',
    senderId: null,
    senderName: 'Original Sender',
    isOutgoing: false,
    reactionCount: 0,
    sentAt: new Date(1000).toISOString(),
    replyToMessageId: null,
    editedAt: null,
    ...overrides,
  };
}

function preview(overrides: Partial<TelegramReplyContextMessage> = {}): TelegramReplyContextMessage {
  return {
    ...message(),
    status: 'loaded',
    ...overrides,
  };
}

test('TelegramInlineReplyPreview renders compact one-line text without sender chrome', async () => {
  const { TelegramInlineReplyPreview } = await import('./TelegramReplyContextViews');
  const html = renderToStaticMarkup(<TelegramInlineReplyPreview preview={preview()} />);

  assert.match(html, /truncate/);
  assert.doesNotMatch(html, /Original Sender/);
  assert.doesNotMatch(html, /line-clamp-2/);
});

test('TelegramInlineReplyPreview makes the reply line clickable without extra expand chrome', async () => {
  const { TelegramInlineReplyPreview } = await import('./TelegramReplyContextViews');
  const html = renderToStaticMarkup(<TelegramInlineReplyPreview preview={preview()} onOpenThread={() => undefined} />);

  assert.match(html, /<button/);
  assert.match(html, /aria-label="Open thread"/);
  assert.doesNotMatch(html, />\+<\/span>/);
  assert.doesNotMatch(html, />Thread</);
});

test('TelegramMessageBubble uses compact ack text for acknowledged outgoing messages', async () => {
  const { TelegramMessageBubble } = await import('./TelegramReplyContextViews');
  const html = renderToStaticMarkup(
    <TelegramMessageBubble message={message({ isOutgoing: true, reactionCount: 1 })} onReply={() => undefined} />
  );

  assert.match(html, />✓ ack<\/span>/);
  assert.doesNotMatch(html, /acknowledged/);
});

test('TelegramReplyContextModal renders a one-line Thread header and thread ack markers', async () => {
  const { TelegramReplyContextModal } = await import('./TelegramReplyContextViews');
  const html = renderToStaticMarkup(
    <TelegramReplyContextModal
      open
      title="Telegram reply chain"
      messages={[preview({ isOutgoing: true, reactionCount: 1 })]}
      loading={false}
      loadingEarlier={false}
      hasEarlier={false}
      error={null}
      onClose={() => undefined}
      onLoadEarlier={() => undefined}
      onReply={() => undefined}
    />
  );

  assert.match(html, />Thread<\/h2>/);
  assert.doesNotMatch(html, /Reply context/);
  assert.doesNotMatch(html, /Telegram reply chain/);
  assert.match(html, />✓ ack<\/span>/);
});

test('TelegramReplyContextModal renders loaded timestamps as jump buttons when a jump handler is supplied', async () => {
  const { TelegramReplyContextModal } = await import('./TelegramReplyContextViews');
  const html = renderToStaticMarkup(
    <TelegramReplyContextModal
      open
      title="Thread"
      messages={[preview({ sentAt: new Date('2026-05-22T20:24:00Z').toISOString() })]}
      loading={false}
      loadingEarlier={false}
      hasEarlier={false}
      error={null}
      onClose={() => undefined}
      onLoadEarlier={() => undefined}
      onReply={() => undefined}
      onJumpToMessage={() => undefined}
    />
  );

  assert.match(html, /<button[^>]+aria-label="Show message from [^"]+ in chat context"/);
  assert.match(html, /title="Show message in chat context"/);
  assert.match(html, /hover:underline/);
});

test('TelegramReplyContextModal keeps unavailable timestamps passive even with a jump handler', async () => {
  const { TelegramReplyContextModal } = await import('./TelegramReplyContextViews');
  const html = renderToStaticMarkup(
    <TelegramReplyContextModal
      open
      title="Thread"
      messages={[preview({ status: 'missing', sentAt: new Date('2026-05-22T20:24:00Z').toISOString() })]}
      loading={false}
      loadingEarlier={false}
      hasEarlier={false}
      error={null}
      onClose={() => undefined}
      onLoadEarlier={() => undefined}
      onReply={() => undefined}
      onJumpToMessage={() => undefined}
    />
  );

  assert.doesNotMatch(html, /Show message from/);
  assert.match(html, /unavailable/);
});
