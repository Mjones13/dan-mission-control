import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTelegramMessagesQuery } from '../../app/api/telegram/chats/[chatId]/messages/params';

test('parseTelegramMessagesQuery accepts bounded ids for reply context resolution', () => {
  const result = parseTelegramMessagesQuery(new URLSearchParams('ids=7,8,7,9'));
  assert.deepEqual(result, { limit: 3, ids: [7, 8, 9] });
});

test('parseTelegramMessagesQuery rejects ids combined with pagination', () => {
  const result = parseTelegramMessagesQuery(new URLSearchParams('ids=7&before=10'));
  assert.deepEqual(result, { error: 'Use ids by itself when resolving Telegram messages.' });
});
