import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { getTelegramConfig } from './config';
import { readTelegramSession } from './session-store';

const CONNECTION_RETRIES = 3;

export interface TelegramClientState {
  configured: boolean;
  hasSession: boolean;
}

export function createTelegramClient(): TelegramClient {
  const config = getTelegramConfig();
  const session = new StringSession(readTelegramSession(config.sessionPath));

  return new TelegramClient(session, config.apiId, config.apiHash, {
    connectionRetries: CONNECTION_RETRIES,
  });
}

export function describeTelegramClientState(): TelegramClientState {
  const config = getTelegramConfig();
  return {
    configured: true,
    hasSession: readTelegramSession(config.sessionPath).length > 0,
  };
}
