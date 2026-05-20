export type MissionControlEnvironment = 'stable' | 'preview' | 'test';
export type TelegramPollingMode = 'normal' | 'slow' | 'manual' | 'disabled';

export interface TelegramPollingPolicy {
  environment: MissionControlEnvironment;
  pollingMode: TelegramPollingMode;
  chatListPollMs: number;
  selectedChatPollMs: number;
  badgePollMs: number;
  pollWhenHidden: boolean;
  manualRefreshOnly: boolean;
}

export const STABLE_TELEGRAM_POLLING_POLICY: TelegramPollingPolicy = {
  environment: 'stable',
  pollingMode: 'normal',
  chatListPollMs: 15_000,
  selectedChatPollMs: 10_000,
  badgePollMs: 30_000,
  pollWhenHidden: false,
  manualRefreshOnly: false,
};

export const PREVIEW_TELEGRAM_POLLING_POLICY: TelegramPollingPolicy = {
  environment: 'preview',
  pollingMode: 'manual',
  chatListPollMs: 120_000,
  selectedChatPollMs: 60_000,
  badgePollMs: 0,
  pollWhenHidden: false,
  manualRefreshOnly: true,
};

export const TEST_TELEGRAM_POLLING_POLICY: TelegramPollingPolicy = {
  environment: 'test',
  pollingMode: 'disabled',
  chatListPollMs: 0,
  selectedChatPollMs: 0,
  badgePollMs: 0,
  pollWhenHidden: false,
  manualRefreshOnly: true,
};

export const DEFAULT_TELEGRAM_POLLING_POLICY = PREVIEW_TELEGRAM_POLLING_POLICY;

const MIN_POLL_MS = 5_000;
const MAX_POLL_MS = 10 * 60_000;
const DISABLED_POLL_MS = 0;

function defaultEnvironment(env: Partial<NodeJS.ProcessEnv>): MissionControlEnvironment {
  if (env.NODE_ENV === 'test') return 'test';
  if (env.PORT === '4000') return 'stable';
  return 'preview';
}

function parseEnvironment(value: string | undefined, fallback: MissionControlEnvironment): MissionControlEnvironment {
  if (value === 'stable' || value === 'preview' || value === 'test') return value;
  return fallback;
}

function defaultPolicyForEnvironment(environment: MissionControlEnvironment): TelegramPollingPolicy {
  if (environment === 'stable') return STABLE_TELEGRAM_POLLING_POLICY;
  if (environment === 'test') return TEST_TELEGRAM_POLLING_POLICY;
  return PREVIEW_TELEGRAM_POLLING_POLICY;
}

function parsePollingMode(value: string | undefined, fallback: TelegramPollingMode): TelegramPollingMode {
  if (value === 'normal' || value === 'slow' || value === 'manual' || value === 'disabled') return value;
  return fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value.toLowerCase())) return true;
  if (['0', 'false', 'no', 'off'].includes(value.toLowerCase())) return false;
  return fallback;
}

function parsePollInterval(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return DISABLED_POLL_MS;
  return Math.min(Math.max(Math.round(parsed), MIN_POLL_MS), MAX_POLL_MS);
}

export function getTelegramPollingPolicy(env: Partial<NodeJS.ProcessEnv> = process.env): TelegramPollingPolicy {
  const environment = parseEnvironment(env.MISSION_CONTROL_ENV, defaultEnvironment(env));
  const defaultPolicy = defaultPolicyForEnvironment(environment);
  const pollingMode = parsePollingMode(env.MISSION_CONTROL_TELEGRAM_POLLING_MODE, defaultPolicy.pollingMode);
  const manualRefreshOnly = pollingMode === 'manual' || pollingMode === 'disabled';

  return {
    environment,
    pollingMode,
    chatListPollMs: parsePollInterval(
      env.MISSION_CONTROL_TELEGRAM_CHAT_LIST_POLL_MS,
      defaultPolicy.chatListPollMs,
    ),
    selectedChatPollMs: parsePollInterval(
      env.MISSION_CONTROL_TELEGRAM_SELECTED_POLL_MS,
      defaultPolicy.selectedChatPollMs,
    ),
    badgePollMs: parsePollInterval(
      env.MISSION_CONTROL_TELEGRAM_BADGE_POLL_MS,
      defaultPolicy.badgePollMs,
    ),
    pollWhenHidden: parseBoolean(
      env.MISSION_CONTROL_TELEGRAM_POLL_WHEN_HIDDEN,
      defaultPolicy.pollWhenHidden,
    ),
    manualRefreshOnly,
  };
}

export function isTelegramPollIntervalEnabled(policy: Pick<TelegramPollingPolicy, 'manualRefreshOnly'>, intervalMs: number): boolean {
  return !policy.manualRefreshOnly && intervalMs > 0;
}
