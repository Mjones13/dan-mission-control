import test from 'node:test';
import assert from 'node:assert/strict';

import { splitTelegramMessageText, TELEGRAM_TEXT_MESSAGE_LIMIT } from './message-chunks';

test('splitTelegramMessageText preserves short messages', () => {
  assert.deepEqual(splitTelegramMessageText('hello'), ['hello']);
});

test('splitTelegramMessageText splits long messages on whitespace near the limit', () => {
  const first = 'a'.repeat(TELEGRAM_TEXT_MESSAGE_LIMIT - 10);
  const second = 'b'.repeat(50);
  const chunks = splitTelegramMessageText(`${first} ${second}`);

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0], first);
  assert.equal(chunks[1], second);
  assert.ok(chunks.every((chunk) => chunk.length <= TELEGRAM_TEXT_MESSAGE_LIMIT));
});

test('splitTelegramMessageText hard-splits long runs without whitespace', () => {
  const text = 'x'.repeat(TELEGRAM_TEXT_MESSAGE_LIMIT + 20);
  const chunks = splitTelegramMessageText(text);

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, TELEGRAM_TEXT_MESSAGE_LIMIT);
  assert.equal(chunks[1].length, 20);
  assert.equal(chunks.join(''), text);
});
