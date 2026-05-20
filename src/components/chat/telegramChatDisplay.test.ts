import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getTelegramChatEmoji } from './telegramChatDisplay';

describe('getTelegramChatEmoji', () => {
  it('uses stable emoji symbols for known Mission Control chats by id', () => {
    assert.equal(getTelegramChatEmoji({ id: '-5112572436', title: 'Finn Work' }), '🐒');
    assert.equal(getTelegramChatEmoji({ id: '-5015476421', title: 'Jace Work' }), '🐬');
    assert.equal(getTelegramChatEmoji({ id: '-5245242051', title: 'Leo Fitness' }), '🦁');
  });

  it('falls back to title matches when chat ids are unavailable or changed', () => {
    assert.equal(getTelegramChatEmoji({ id: 'unknown-finn-id', title: 'Finn Work' }), '🐒');
    assert.equal(getTelegramChatEmoji({ id: 'unknown-jace-id', title: 'Jace Work' }), '🐬');
    assert.equal(getTelegramChatEmoji({ id: 'unknown-leo-id', title: 'Leo Fitness' }), '🦁');
  });

  it('uses the generic chat bubble for unknown chats', () => {
    assert.equal(getTelegramChatEmoji({ id: 'other', title: 'Other Group' }), '💬');
  });
});
