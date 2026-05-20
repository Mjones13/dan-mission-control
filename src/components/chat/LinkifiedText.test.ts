import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { tokenizeText, type TextPart } from './LinkifiedText';

function linkedValues(text: string): Array<Pick<TextPart, 'type' | 'value'>> {
  return tokenizeText(text)
    .filter((part) => part.type !== 'text')
    .map((part) => ({ type: part.type, value: part.value }));
}

describe('tokenizeText', () => {
  it('does not link prose slash pairs', () => {
    assert.deepEqual(linkedValues('Open in a new tab/window and/or inspect slash/path or word/path.'), []);
  });

  it('links slash commands that start a token', () => {
    assert.deepEqual(linkedValues('Try /status, /approve, and /users.'), [
      { type: 'slash-token', value: '/status' },
      { type: 'slash-token', value: '/approve' },
      { type: 'slash-token', value: '/users' },
    ]);
  });

  it('links absolute-ish slash paths', () => {
    assert.deepEqual(linkedValues('See /Users/mjones/AGENTS.md, /src/lib/foo.ts, and /api/telegram/chats.'), [
      { type: 'slash-token', value: '/Users/mjones/AGENTS.md' },
      { type: 'slash-token', value: '/src/lib/foo.ts' },
      { type: 'slash-token', value: '/api/telegram/chats' },
    ]);
  });

  it('links relative paths and filenames with known file extensions', () => {
    assert.deepEqual(linkedValues('Files: src/lib/telegram/message-chunks.ts, AGENTS.md, foo/bar.js, config.yaml.'), [
      { type: 'slash-token', value: 'src/lib/telegram/message-chunks.ts' },
      { type: 'slash-token', value: 'AGENTS.md' },
      { type: 'slash-token', value: 'foo/bar.js' },
      { type: 'slash-token', value: 'config.yaml' },
    ]);
  });

  it('preserves http and https URL classification', () => {
    assert.deepEqual(linkedValues('Visit https://example.com/a/b?x=1 and http://localhost:4000/chat-inbox.'), [
      { type: 'url', value: 'https://example.com/a/b?x=1' },
      { type: 'url', value: 'http://localhost:4000/chat-inbox' },
    ]);
  });

  it('highlights camelCase and PascalCase code-like identifiers', () => {
    assert.deepEqual(
      linkedValues('Call loadOlderMessages, splitTelegramMessageText, messageCacheByChatId, TelegramChatInboxPage, and ChatMessageCacheEntry.'),
      [
        { type: 'code-identifier', value: 'loadOlderMessages' },
        { type: 'code-identifier', value: 'splitTelegramMessageText' },
        { type: 'code-identifier', value: 'messageCacheByChatId' },
        { type: 'code-identifier', value: 'TelegramChatInboxPage' },
        { type: 'code-identifier', value: 'ChatMessageCacheEntry' },
      ],
    );
  });

  it('does not highlight simple capitalized prose or short mixed-case words', () => {
    assert.deepEqual(linkedValues('Telegram users saw Bob and iOS on May 1.'), []);
  });

  it('keeps URL, path, and slash command classification ahead of identifier highlighting', () => {
    assert.deepEqual(linkedValues('Open /status, src/components/chat/LinkifiedText.tsx, and https://example.com/loadOlderMessages.'), [
      { type: 'slash-token', value: '/status' },
      { type: 'slash-token', value: 'src/components/chat/LinkifiedText.tsx' },
      { type: 'url', value: 'https://example.com/loadOlderMessages' },
    ]);
  });

  it('keeps leading and trailing punctuation as text around linked tokens', () => {
    assert.deepEqual(tokenizeText('(/status), then `src/app/page.tsx`.'), [
      { type: 'text', value: '(' },
      { type: 'slash-token', value: '/status' },
      { type: 'text', value: '),' },
      { type: 'text', value: ' then ' },
      { type: 'text', value: '`' },
      { type: 'slash-token', value: 'src/app/page.tsx' },
      { type: 'text', value: '`.' },
    ]);
  });
});
