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
  const message = getErrorMessage(error);
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

  return {
    code: 'TELEGRAM_ERROR',
    message: 'Telegram request failed. Check the server logs for details.',
  };
}
