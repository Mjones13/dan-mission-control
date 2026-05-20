import assert from 'node:assert/strict';
import test from 'node:test';
import { getTelegramPollingPolicy, isTelegramPollIntervalEnabled } from './policy';

test('stable policy defaults cut polling to one minute and thirty seconds', () => {
  const policy = getTelegramPollingPolicy({ MISSION_CONTROL_ENV: 'stable' });

  assert.equal(policy.environment, 'stable');
  assert.equal(policy.pollingMode, 'normal');
  assert.equal(policy.chatListPollMs, 60_000);
  assert.equal(policy.selectedChatPollMs, 30_000);
  assert.equal(policy.badgePollMs, 60_000);
  assert.equal(policy.pollWhenHidden, false);
  assert.equal(policy.manualRefreshOnly, false);
});

test('preview policy defaults to manual refresh and disables badge interval', () => {
  const policy = getTelegramPollingPolicy({ MISSION_CONTROL_ENV: 'preview' });

  assert.equal(policy.environment, 'preview');
  assert.equal(policy.pollingMode, 'manual');
  assert.equal(policy.chatListPollMs, 120_000);
  assert.equal(policy.selectedChatPollMs, 60_000);
  assert.equal(policy.badgePollMs, 0);
  assert.equal(policy.manualRefreshOnly, true);
  assert.equal(isTelegramPollIntervalEnabled(policy, policy.chatListPollMs), false);
});

test('unknown local environment fails quiet as preview unless port 4000 is explicit', () => {
  assert.equal(getTelegramPollingPolicy({}).environment, 'preview');
  assert.equal(getTelegramPollingPolicy({ PORT: '4000' }).environment, 'stable');
});

test('environment overrides clamp intervals and parse hidden polling boolean', () => {
  const policy = getTelegramPollingPolicy({
    MISSION_CONTROL_ENV: 'stable',
    MISSION_CONTROL_TELEGRAM_POLLING_MODE: 'slow',
    MISSION_CONTROL_TELEGRAM_CHAT_LIST_POLL_MS: '1000',
    MISSION_CONTROL_TELEGRAM_SELECTED_POLL_MS: '999999999',
    MISSION_CONTROL_TELEGRAM_BADGE_POLL_MS: '0',
    MISSION_CONTROL_TELEGRAM_POLL_WHEN_HIDDEN: 'true',
  });

  assert.equal(policy.pollingMode, 'slow');
  assert.equal(policy.chatListPollMs, 5_000);
  assert.equal(policy.selectedChatPollMs, 600_000);
  assert.equal(policy.badgePollMs, 0);
  assert.equal(policy.pollWhenHidden, true);
  assert.equal(policy.manualRefreshOnly, false);
});

test('manual and disabled modes suppress interval polling', () => {
  const manual = getTelegramPollingPolicy({ MISSION_CONTROL_ENV: 'stable', MISSION_CONTROL_TELEGRAM_POLLING_MODE: 'manual' });
  const disabled = getTelegramPollingPolicy({ MISSION_CONTROL_ENV: 'stable', MISSION_CONTROL_TELEGRAM_POLLING_MODE: 'disabled' });

  assert.equal(manual.manualRefreshOnly, true);
  assert.equal(disabled.manualRefreshOnly, true);
  assert.equal(isTelegramPollIntervalEnabled(manual, 60_000), false);
  assert.equal(isTelegramPollIntervalEnabled(disabled, 60_000), false);
});
