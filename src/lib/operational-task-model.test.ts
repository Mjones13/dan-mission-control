import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOperationalQueueGroup,
  getSafeCreateStatusError,
  isDispatchEnabled,
  isSafeCreateStatus,
} from './operational-task-model';

test('v1 operational tasks only allow safe create statuses', () => {
  assert.equal(isSafeCreateStatus('inbox'), true);
  assert.equal(isSafeCreateStatus('planning'), true);
  assert.equal(isSafeCreateStatus('review'), true);

  assert.equal(isSafeCreateStatus('assigned'), false);
  assert.equal(isSafeCreateStatus('in_progress'), false);
  assert.match(getSafeCreateStatusError('assigned') || '', /could imply dispatch/);
  assert.match(getSafeCreateStatusError('done') || '', /cannot be created directly as done/);
});

test('operational queue groups map existing statuses to v1 inbox buckets', () => {
  assert.equal(getOperationalQueueGroup('inbox'), 'inbox');
  assert.equal(getOperationalQueueGroup('planning'), 'ready');
  assert.equal(getOperationalQueueGroup('assigned'), 'running');
  assert.equal(getOperationalQueueGroup('in_progress'), 'running');
  assert.equal(getOperationalQueueGroup('review'), 'review');
  assert.equal(getOperationalQueueGroup('verification'), 'review');
  assert.equal(getOperationalQueueGroup('done'), 'done');
});

test('dispatch is disabled by default for v1 safety', () => {
  const previousDispatch = process.env.DISPATCH_ENABLED;
  const previousExternal = process.env.EXTERNAL_ACTIONS_ENABLED;
  delete process.env.DISPATCH_ENABLED;
  delete process.env.EXTERNAL_ACTIONS_ENABLED;

  try {
    assert.equal(isDispatchEnabled(), false);

    process.env.DISPATCH_ENABLED = 'true';
    assert.equal(isDispatchEnabled(), true);

    process.env.DISPATCH_ENABLED = 'false';
    process.env.EXTERNAL_ACTIONS_ENABLED = 'true';
    assert.equal(isDispatchEnabled(), true);
  } finally {
    if (previousDispatch === undefined) delete process.env.DISPATCH_ENABLED;
    else process.env.DISPATCH_ENABLED = previousDispatch;

    if (previousExternal === undefined) delete process.env.EXTERNAL_ACTIONS_ENABLED;
    else process.env.EXTERNAL_ACTIONS_ENABLED = previousExternal;
  }
});
