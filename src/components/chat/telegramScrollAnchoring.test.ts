import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appendedActionableMessageCount,
  appendedMessageCount,
  classifyMessageListChange,
  getScrollBottom,
  isUserScrollingAway,
  isWithinBottomLockThreshold,
  isWithinLooseNearBottomThreshold,
  restoredScrollTopForHeightDelta,
  scrollTopForCenteredElement,
  scrollTopForPreservedBottom,
  shouldRestoreOlderMessageAnchor,
} from './telegramScrollAnchoring';

describe('telegramScrollAnchoring', () => {
  it('classifies appended message ids', () => {
    assert.equal(classifyMessageListChange([10, 11], [10, 11, 12, 13]), 'append');
    assert.equal(appendedMessageCount([10, 11], [10, 11, 12, 13]), 2);
  });

  it('counts only actionable appended messages for jump-to-latest affordances', () => {
    const messages = [
      { id: 10, text: 'existing' },
      { id: 11, text: 'new status' },
      { id: 12, text: 'new actionable' },
    ];

    assert.equal(
      appendedActionableMessageCount([10], messages, (message) => !message.text.includes('status')),
      1,
    );
  });

  it('uses tight bottom-lock engagement separate from loose near-bottom geometry', () => {
    assert.equal(isWithinBottomLockThreshold(24), true);
    assert.equal(isWithinBottomLockThreshold(25), false);
    assert.equal(isWithinLooseNearBottomThreshold(79), true);
    assert.equal(isWithinLooseNearBottomThreshold(80), false);
  });

  it('detects upward scroll intent before the user escapes the old near-bottom threshold', () => {
    assert.equal(isUserScrollingAway(1000, 998), true);
    assert.equal(isUserScrollingAway(1000, 1000), false);
    assert.equal(isUserScrollingAway(1000, 1005), false);
  });

  it('classifies prepended message ids', () => {
    assert.equal(classifyMessageListChange([10, 11], [8, 9, 10, 11]), 'prepend');
    assert.equal(appendedMessageCount([10, 11], [8, 9, 10, 11]), 0);
  });

  it('classifies mixed changes when the old list remains contiguous', () => {
    assert.equal(classifyMessageListChange([10, 11], [8, 9, 10, 11, 12]), 'mixed');
    assert.equal(appendedMessageCount([10, 11], [8, 9, 10, 11, 12]), 1);
  });

  it('classifies replaced or unchanged id lists', () => {
    assert.equal(classifyMessageListChange([10, 11], [10, 11]), 'same');
    assert.equal(classifyMessageListChange([10, 11], [20, 21]), 'replace');
    assert.equal(classifyMessageListChange([], [20, 21]), 'replace');
  });

  it('calculates scrollTop restoration from a scrollHeight delta', () => {
    assert.equal(restoredScrollTopForHeightDelta(240, 1000, 1425), 665);
  });

  it('calculates preserved scrollBottom for explicit load-older anchoring', () => {
    const oldScrollBottom = getScrollBottom(1000, 240, 400);
    assert.equal(oldScrollBottom, 360);
    assert.equal(scrollTopForPreservedBottom(1425, oldScrollBottom, 400), 665);
  });

  it('calculates a container-relative centered scrollTop for manual jumps', () => {
    assert.equal(scrollTopForCenteredElement(200, 100, 400, 650, 80), 590);
  });

  it('top-aligns tall manual jump targets near the pane start', () => {
    assert.equal(scrollTopForCenteredElement(200, 100, 400, 650, 360), 738);
  });

  it('clamps centered manual jump scrollTop at the top boundary', () => {
    assert.equal(scrollTopForCenteredElement(20, 100, 400, 140, 80), 0);
  });

  it('clamps top-aligned tall manual jump scrollTop at the top boundary', () => {
    assert.equal(scrollTopForCenteredElement(20, 100, 400, 105, 360), 13);
    assert.equal(scrollTopForCenteredElement(20, 100, 400, 90, 360), 0);
  });

  it('prioritizes older-message anchoring only for explicit load-older prepends', () => {
    assert.equal(shouldRestoreOlderMessageAnchor('prepend', true), true);
    assert.equal(shouldRestoreOlderMessageAnchor('mixed', true), true);
    assert.equal(shouldRestoreOlderMessageAnchor('append', true), false);
    assert.equal(shouldRestoreOlderMessageAnchor('prepend', false), false);
  });
});
