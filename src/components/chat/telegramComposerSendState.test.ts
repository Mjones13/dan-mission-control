import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canStartTelegramSend,
  recoverFailedTelegramDraft,
  shouldSendTelegramComposerFromKeyDown,
  telegramSendButtonClassName,
} from './telegramComposerSendState';

function resolveSuccessfulSend(initialDraft: string): string {
  assert.equal(canStartTelegramSend(initialDraft, false), true);
  const draft = '';
  assert.equal(telegramSendButtonClassName(true).includes('bg-emerald-500'), true);
  assert.equal(telegramSendButtonClassName(true).includes('cursor-wait'), true);
  assert.equal(telegramSendButtonClassName(false).includes('bg-mc-accent'), true);
  return draft;
}

test('send success clears draft immediately and exposes green loading state while pending', () => {
  assert.equal(resolveSuccessfulSend('hello'), '');
});

test('failed send restores attempted text when no new draft was typed', () => {
  assert.equal(recoverFailedTelegramDraft('', 'hello'), 'hello');
});

test('failed send appends attempted text below newly typed draft', () => {
  assert.equal(recoverFailedTelegramDraft('new draft', 'first attempt'), 'new draft\n\nfirst attempt');
});

test('long-message partial failure preserves only the unsent suffix for recovery', () => {
  assert.equal(recoverFailedTelegramDraft('', 'chunk 2\nchunk 3'), 'chunk 2\nchunk 3');
  assert.equal(recoverFailedTelegramDraft('next draft', 'chunk 2\nchunk 3'), 'next draft\n\nchunk 2\nchunk 3');
});

test('programmatic newline recovery does not qualify as an Enter key send event', () => {
  const recoveredDraft = recoverFailedTelegramDraft('new draft', 'failed text');
  assert.equal(recoveredDraft, 'new draft\n\nfailed text');
  assert.equal(shouldSendTelegramComposerFromKeyDown('input', false), false);
  assert.equal(shouldSendTelegramComposerFromKeyDown('Enter', true), false);
  assert.equal(shouldSendTelegramComposerFromKeyDown('Enter', false), true);
});

test('send guard blocks empty drafts and in-flight duplicate sends', () => {
  assert.equal(canStartTelegramSend('   ', false), false);
  assert.equal(canStartTelegramSend('hello', true), false);
  assert.equal(canStartTelegramSend('hello', false), true);
});
