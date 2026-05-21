import { Api } from 'telegram';
import { getTelegramConfig } from './config';
import { createTelegramClient } from './client';
import { resetTelegramClientManager } from './client-manager';
import { writeTelegramSession } from './session-store';

interface SendCodeResult {
  isCodeViaApp: boolean;
}

interface SignInResult {
  authorized: boolean;
  needsPassword: boolean;
}

let pendingPhoneNumber: string | null = null;
let pendingPhoneCodeHash: string | null = null;

async function saveClientSession(client: ReturnType<typeof createTelegramClient>) {
  const config = getTelegramConfig();
  const session = client.session.save() as unknown;
  if (typeof session === 'string' && session.length > 0) {
    writeTelegramSession(config.sessionPath, session);
    await resetTelegramClientManager('auth-session-updated');
  }
}

export async function sendTelegramLoginCode(phoneNumber: string): Promise<SendCodeResult> {
  const config = getTelegramConfig();
  const client = createTelegramClient();

  await client.connect();
  try {
    const result = await client.sendCode(
      { apiId: config.apiId, apiHash: config.apiHash },
      phoneNumber,
    );

    pendingPhoneNumber = phoneNumber;
    pendingPhoneCodeHash = result.phoneCodeHash;
    await saveClientSession(client);

    return { isCodeViaApp: result.isCodeViaApp };
  } finally {
    await client.disconnect();
  }
}

export async function signInTelegramWithCode(code: string): Promise<SignInResult> {
  if (!pendingPhoneNumber || !pendingPhoneCodeHash) {
    throw new Error('No Telegram login code request is pending. Send a code first.');
  }

  const client = createTelegramClient();
  await client.connect();

  try {
    await client.invoke(new Api.auth.SignIn({
      phoneNumber: pendingPhoneNumber,
      phoneCodeHash: pendingPhoneCodeHash,
      phoneCode: code,
    }));

    await saveClientSession(client);
    pendingPhoneNumber = null;
    pendingPhoneCodeHash = null;

    return { authorized: true, needsPassword: false };
  } catch (error) {
    await saveClientSession(client);
    if (error instanceof Error && error.message.includes('SESSION_PASSWORD_NEEDED')) {
      return { authorized: false, needsPassword: true };
    }
    throw error;
  } finally {
    await client.disconnect();
  }
}

export async function signInTelegramWithPassword(password: string): Promise<SignInResult> {
  const config = getTelegramConfig();
  const client = createTelegramClient();
  await client.connect();

  try {
    await client.signInWithPassword(
      { apiId: config.apiId, apiHash: config.apiHash },
      {
        password: async () => password,
        onError: async () => true,
      },
    );

    await saveClientSession(client);
    pendingPhoneNumber = null;
    pendingPhoneCodeHash = null;

    return { authorized: true, needsPassword: false };
  } finally {
    await client.disconnect();
  }
}
