import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TelegramReplyContextMessage } from './telegramReplyContext';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function preview(overrides: Partial<TelegramReplyContextMessage> = {}): TelegramReplyContextMessage {
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

test('TelegramInlineReplyPreview uses a compact expand affordance when thread opening is available', async () => {
  const { TelegramInlineReplyPreview } = await import('./TelegramReplyContextViews');
  const html = renderToStaticMarkup(<TelegramInlineReplyPreview preview={preview()} onOpenThread={() => undefined} />);

  assert.match(html, /<button/);
  assert.match(html, /aria-label="Open reply context"/);
  assert.match(html, />\+<\/span>/);
  assert.doesNotMatch(html, />Thread</);
});
