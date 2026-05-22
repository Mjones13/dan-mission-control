import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appendedMessageCount,
  classifyMessageListChange,
  getScrollBottom,
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

  it('clamps centered manual jump scrollTop at the top boundary', () => {
    assert.equal(scrollTopForCenteredElement(20, 100, 400, 140, 80), 0);
  });

  it('prioritizes older-message anchoring only for explicit load-older prepends', () => {
    assert.equal(shouldRestoreOlderMessageAnchor('prepend', true), true);
    assert.equal(shouldRestoreOlderMessageAnchor('mixed', true), true);
    assert.equal(shouldRestoreOlderMessageAnchor('append', true), false);
    assert.equal(shouldRestoreOlderMessageAnchor('prepend', false), false);
  });
});
