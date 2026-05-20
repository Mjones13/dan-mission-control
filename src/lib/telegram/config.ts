import path from 'path';

export interface TelegramConfigStatus {
  hasApiId: boolean;
  hasApiHash: boolean;
  apiIdValid: boolean;
  configured: boolean;
  sessionStorage: 'file';
  sessionPath: string;
}

export interface TelegramConfig {
  apiId: number;
  apiHash: string;
  sessionPath: string;
}

const DEFAULT_SESSION_PATH = path.join(process.cwd(), '.telegram-session');

function getSessionPath(): string {
  return process.env.TELEGRAM_SESSION_PATH || DEFAULT_SESSION_PATH;
}

function parseApiId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function getTelegramConfigStatus(): TelegramConfigStatus {
  const apiId = parseApiId(process.env.TELEGRAM_API_ID);
  const hasApiHash = Boolean(process.env.TELEGRAM_API_HASH);

  return {
    hasApiId: Boolean(process.env.TELEGRAM_API_ID),
    hasApiHash,
    apiIdValid: apiId !== null,
    configured: apiId !== null && hasApiHash,
    sessionStorage: 'file',
    sessionPath: getSessionPath(),
  };
}

export function getTelegramConfig(): TelegramConfig {
  const status = getTelegramConfigStatus();
  const apiId = parseApiId(process.env.TELEGRAM_API_ID);

  if (!status.configured || apiId === null || !process.env.TELEGRAM_API_HASH) {
    throw new Error('Telegram API credentials are not configured. Set TELEGRAM_API_ID and TELEGRAM_API_HASH.');
  }

  return {
    apiId,
    apiHash: process.env.TELEGRAM_API_HASH,
    sessionPath: status.sessionPath,
  };
}
