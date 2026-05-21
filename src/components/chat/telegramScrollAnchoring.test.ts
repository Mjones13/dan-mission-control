import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appendedMessageCount, classifyMessageListChange, restoredScrollTopForHeightDelta } from './telegramScrollAnchoring';

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
});
