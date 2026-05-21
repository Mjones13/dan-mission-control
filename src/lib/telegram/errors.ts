export interface TelegramSafeError {
  code: string;
  message: string;
  waitSeconds?: number;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function toTelegramSafeError(error: unknown): TelegramSafeError {
  // Return operator-safe messages; raw GramJS errors may include noisy internals for server logs only.
  const message = getErrorMessage(error);
  const errorName = error instanceof Error ? error.name : '';
  const combined = `${errorName} ${message}`;

  const floodWait = message.match(/FLOOD_WAIT_(\d+)/);
  if (floodWait) {
    const waitSeconds = Number(floodWait[1]);
    return {
      code: 'FLOOD_WAIT',
      message: `Telegram asked us to wait ${waitSeconds} seconds before retrying.`,
      waitSeconds,
    };
  }

  const slowMode = message.match(/SLOWMODE_WAIT_(\d+)/);
  if (slowMode) {
    const waitSeconds = Number(slowMode[1]);
    return {
      code: 'SLOWMODE_WAIT',
      message: `This Telegram chat is in slow mode. Wait ${waitSeconds} seconds before retrying.`,
      waitSeconds,
    };
  }

  if (message.includes('SESSION_PASSWORD_NEEDED')) {
    return {
      code: 'SESSION_PASSWORD_NEEDED',
      message: 'Telegram requires your 2FA password to finish sign-in.',
    };
  }

  if (message.includes('TELEGRAM_SESSION_REQUIRED') || /Unauthorized|AUTH_KEY_UNREGISTERED|SESSION_REVOKED/i.test(combined)) {
    return {
      code: 'UNAUTHORIZED',
      message: 'Telegram session authorization is required.',
    };
  }

  if (/AUTH_KEY|AuthKey/i.test(combined)) {
    return {
      code: 'AUTH_KEY',
      message: 'Telegram session key is invalid. Re-authentication may be required.',
    };
  }

  if (/Cannot send requests while disconnected|CONNECTION_NOT_INITED|disconnected/i.test(combined)) {
    return {
      code: 'DISCONNECTED',
      message: 'Telegram client disconnected before the request completed.',
    };
  }

  if (/TIMEOUT|TimedOut|timeout/i.test(combined)) {
    return {
      code: 'TIMEOUT',
      message: 'Telegram request timed out. Check the latest messages before retrying sends.',
    };
  }

  return {
    code: 'TELEGRAM_ERROR',
    message: 'Telegram request failed. Check the server logs for details.',
  };
}
