import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTelegramMessagesQuery } from './params';

test('parseTelegramMessagesQuery rejects before and after together', () => {
  const result = parseTelegramMessagesQuery(new URLSearchParams('before=1&after=2'));
  assert.deepEqual(result, { error: 'Use either before or after when listing Telegram messages, not both.' });
});

test('parseTelegramMessagesQuery accepts after and caps limit', () => {
  const result = parseTelegramMessagesQuery(new URLSearchParams('limit=500&after=42'));
  assert.deepEqual(result, { limit: 100, beforeMessageId: undefined, afterMessageId: 42 });
});

test('parseTelegramMessagesQuery rejects invalid after ids', () => {
  const result = parseTelegramMessagesQuery(new URLSearchParams('after=abc'));
  assert.deepEqual(result, { error: 'after must be a positive message id.' });
});
