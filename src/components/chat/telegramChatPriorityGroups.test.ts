import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPriorityTelegramChatKey,
  groupTelegramChatsByPriority,
  shouldRenderTelegramChatPrioritySeparator,
} from './telegramChatPriorityGroups';
import type { TelegramChat } from './useTelegramChatInbox';

function chat(id: string, title: string): TelegramChat {
  return {
    id,
    title,
    unreadCount: 0,
    lastMessageAt: null,
    lastMessagePreview: null,
  };
}

test('priority chats are partitioned to the top while preserving input recency order within each group', () => {
  const chats = [
    chat('forge', 'Forge'),
    chat('finn', 'Finn'),
    chat('harbor', 'Harbor'),
    chat('atlas', 'Atlas'),
    chat('jace', 'Jace'),
    chat('canary', 'Canary'),
    chat('leo', 'Leo'),
  ];

  const groups = groupTelegramChatsByPriority(chats);

  assert.deepEqual(groups.priorityChats.map((item) => item.title), ['Finn', 'Atlas', 'Jace', 'Leo']);
  assert.deepEqual(groups.otherChats.map((item) => item.title), ['Forge', 'Harbor', 'Canary']);
});

test('a newer non-priority chat does not sort above an older priority chat', () => {
  const chats = [
    chat('google-docs', 'Google Docs'),
    chat('feynman', 'Feynman'),
    chat('jace', 'Jace'),
  ];

  const groups = groupTelegramChatsByPriority(chats);

  assert.deepEqual(groups.priorityChats.map((item) => item.title), ['Jace']);
  assert.deepEqual(groups.otherChats.map((item) => item.title), ['Google Docs', 'Feynman']);
});

test('missing priority chats create no placeholders and unknown chats stay in the bottom group', () => {
  const groups = groupTelegramChatsByPriority([
    chat('marshal', 'Marshal'),
    chat('canary', 'Canary'),
  ]);

  assert.equal(groups.priorityChats.length, 0);
  assert.deepEqual(groups.otherChats.map((item) => item.title), ['Marshal', 'Canary']);
});

test('priority matching is case-insensitive and checks configured ids before titles', () => {
  assert.equal(getPriorityTelegramChatKey(chat('agent:Finn', 'Workhorse')), 'finn');
  assert.equal(getPriorityTelegramChatKey(chat('telegram-123', 'ATLAS command')), 'atlas');
  assert.equal(getPriorityTelegramChatKey(chat('telegram-456', 'jace inbox')), 'jace');
  assert.equal(getPriorityTelegramChatKey(chat('telegram-789', 'Message Leo')), 'leo');
});

test('first configured priority match wins for ambiguous chat titles', () => {
  assert.equal(getPriorityTelegramChatKey(chat('ambiguous', 'Atlas and Finn coordination')), 'atlas');
});

test('separator is only needed when both priority and other chats are present', () => {
  assert.equal(shouldRenderTelegramChatPrioritySeparator({ priorityChats: [chat('finn', 'Finn')], otherChats: [chat('forge', 'Forge')] }), true);
  assert.equal(shouldRenderTelegramChatPrioritySeparator({ priorityChats: [chat('finn', 'Finn')], otherChats: [] }), false);
  assert.equal(shouldRenderTelegramChatPrioritySeparator({ priorityChats: [], otherChats: [chat('forge', 'Forge')] }), false);
});
