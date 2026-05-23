import assert from 'node:assert/strict';
import test from 'node:test';
import { focusTelegramComposerAfterReply } from './telegramComposerFocus';

test('focusTelegramComposerAfterReply focuses the composer on the next animation frame', () => {
  let animationFrameCallback: (() => void) | null = null;
  let focused = 0;

  focusTelegramComposerAfterReply(
    { focus: () => { focused += 1; } },
    {
      requestAnimationFrame: (callback) => {
        animationFrameCallback = callback;
        return 1;
      },
      setTimeout: () => 2,
    },
  );

  assert.equal(focused, 0);
  animationFrameCallback?.();
  assert.equal(focused, 1);
});

test('focusTelegramComposerAfterReply only focuses once when timeout fallback also fires', () => {
  let animationFrameCallback: (() => void) | null = null;
  let timeoutCallback: (() => void) | null = null;
  let focused = 0;

  focusTelegramComposerAfterReply(
    { focus: () => { focused += 1; } },
    {
      requestAnimationFrame: (callback) => {
        animationFrameCallback = callback;
        return 1;
      },
      setTimeout: (callback) => {
        timeoutCallback = callback;
        return 2;
      },
    },
  );

  animationFrameCallback?.();
  timeoutCallback?.();
  assert.equal(focused, 1);
});

test('focusTelegramComposerAfterReply cancel prevents scheduled focus', () => {
  let animationFrameCallback: (() => void) | null = null;
  let timeoutCallback: (() => void) | null = null;
  const canceledFrames: number[] = [];
  const clearedTimeouts: number[] = [];
  let focused = 0;

  const cancel = focusTelegramComposerAfterReply(
    { focus: () => { focused += 1; } },
    {
      requestAnimationFrame: (callback) => {
        animationFrameCallback = callback;
        return 1;
      },
      cancelAnimationFrame: (handle) => canceledFrames.push(handle),
      setTimeout: (callback) => {
        timeoutCallback = callback;
        return 2;
      },
      clearTimeout: (handle) => clearedTimeouts.push(handle),
    },
  );

  cancel();
  assert.deepEqual(canceledFrames, [1]);
  assert.deepEqual(clearedTimeouts, [2]);

  animationFrameCallback?.();
  timeoutCallback?.();
  assert.equal(focused, 0);
});
