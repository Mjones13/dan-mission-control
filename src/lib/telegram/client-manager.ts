import type { TelegramClient } from 'telegram';
import { createTelegramClient } from './client';
import { clearTelegramDialogCache } from './dialog-cache';
import { toTelegramSafeError } from './errors';
import { TelegramRpcLimiter, type TelegramRpcLimitSnapshot } from './rpc-limiter';

type ManagedTelegramClient = TelegramClient & {
  // GramJS exposes these lifecycle flags at runtime, but not consistently through its TS types.
  connected?: boolean;
  disconnected?: boolean;
  destroy?: () => Promise<void> | void;
};

export type TelegramManagerState = 'idle' | 'connecting' | 'ready' | 'unauthorized' | 'disconnected' | 'resetting' | 'error';
export type TelegramOperationPriority = 'interactive' | 'background' | 'send' | 'read';

export interface TelegramClientLeaseMeta {
  requestId: string;
  reusedClient: boolean;
  connectStarted: boolean;
  connectMs?: number;
  authorizationCheckMs?: number;
  inFlight: number;
  generation: number;
}

export interface TelegramClientManagerHealth {
  state: TelegramManagerState;
  hasClient: boolean;
  connected: boolean;
  connectInFlight: boolean;
  inFlight: number;
  createdAt: string | null;
  lastUsedAt: string | null;
  lastConnectedAt: string | null;
  lastAuthorizedAt: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
  generation: number;
  rpcLimiter: TelegramRpcLimitSnapshot;
  sendLimiter: TelegramRpcLimitSnapshot;
}

export interface WithTelegramClientOptions {
  requestId?: string;
  operation: string;
  priority?: TelegramOperationPriority;
  requireAuthorization?: boolean;
}

interface EnsureResult {
  client: ManagedTelegramClient;
  reusedClient: boolean;
  connectStarted: boolean;
  connectMs?: number;
  authorizationCheckMs?: number;
}

interface TelegramClientManagerInternals {
  client: ManagedTelegramClient | null;
  connectPromise: Promise<EnsureResult> | null;
  state: TelegramManagerState;
  inFlight: number;
  createdAt: string | null;
  lastUsedAt: string | null;
  lastConnectedAt: string | null;
  lastAuthorizedAt: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
  generation: number;
  shutdownHooksRegistered: boolean;
  rpcLimiter: TelegramRpcLimiter;
  sendLimiter: TelegramRpcLimiter;
  clientFactory: () => ManagedTelegramClient;
}

// Re-check authorization periodically without paying the GramJS round-trip on every warmed request.
const AUTHORIZATION_TTL_MS = 45_000;
// Next.js can reload modules in development, so store the warm client on a process-wide symbol.
const GLOBAL_KEY = Symbol.for('missionControl.telegramClientManager');
const isTest = process.env.NODE_ENV === 'test';

type GlobalWithManager = typeof globalThis & { [GLOBAL_KEY]?: TelegramClientManagerInternals };

function nowIso() {
  return new Date().toISOString();
}

function createManager(): TelegramClientManagerInternals {
  return {
    client: null,
    connectPromise: null,
    state: 'idle',
    inFlight: 0,
    createdAt: null,
    lastUsedAt: null,
    lastConnectedAt: null,
    lastAuthorizedAt: null,
    lastErrorCode: null,
    lastErrorAt: null,
    generation: 0,
    shutdownHooksRegistered: false,
    rpcLimiter: new TelegramRpcLimiter(2),
    sendLimiter: new TelegramRpcLimiter(1),
    clientFactory: () => createTelegramClient() as ManagedTelegramClient,
  };
}

function getManager(): TelegramClientManagerInternals {
  if (isTest) return testManager;

  const globalWithManager = globalThis as GlobalWithManager;
  if (!globalWithManager[GLOBAL_KEY]) {
    globalWithManager[GLOBAL_KEY] = createManager();
  }
  return globalWithManager[GLOBAL_KEY];
}

let testManager = createManager();

function isConnected(client: ManagedTelegramClient | null): boolean {
  // Treat missing flags as connected because older/mocked GramJS clients may not expose both fields.
  return Boolean(client && client.connected !== false && client.disconnected !== true);
}

function authorizationFresh(manager: TelegramClientManagerInternals): boolean {
  if (!manager.lastAuthorizedAt) return false;
  return Date.now() - Date.parse(manager.lastAuthorizedAt) < AUTHORIZATION_TTL_MS;
}

function createRequestId() {
  return `tg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function classifyForManager(error: unknown): { code: string; shouldResetClient: boolean } {
  // Only reset the warm client for errors that imply the session or transport is no longer usable.
  const safe = toTelegramSafeError(error);
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';
  const shouldResetClient =
    safe.code === 'SESSION_PASSWORD_NEEDED' ||
    safe.code === 'AUTH_KEY' ||
    (safe.code === 'UNAUTHORIZED' && !message.includes('TELEGRAM_SESSION_REQUIRED')) ||
    /AUTH_KEY|SESSION_REVOKED|USER_DEACTIVATED|Cannot send requests while disconnected|CONNECTION_NOT_INITED|disconnected/i.test(`${name} ${message}`);

  return { code: safe.code, shouldResetClient };
}

async function cleanupClient(client: ManagedTelegramClient | null): Promise<void> {
  if (!client) return;
  // Prefer destroy when available so GramJS releases reconnect timers as well as the socket.
  if (typeof client.destroy === 'function') {
    await client.destroy();
    return;
  }
  await client.disconnect();
}

async function ensureConnectedAuthorized(requireAuthorization: boolean): Promise<EnsureResult> {
  // Share one connect/auth attempt across concurrent requests to avoid parallel GramJS handshakes.
  const manager = getManager();
  const existing = manager.client;
  if (isConnected(existing) && (!requireAuthorization || authorizationFresh(manager))) {
    return { client: existing as ManagedTelegramClient, reusedClient: true, connectStarted: false };
  }

  if (manager.connectPromise) {
    const result = await manager.connectPromise;
    return { ...result, reusedClient: true, connectStarted: false };
  }

  manager.connectPromise = (async () => {
    const connectStart = Date.now();
    manager.state = 'connecting';
    let client = manager.client;
    let reusedClient = Boolean(client);
    if (!client) {
      client = manager.clientFactory();
      manager.client = client;
      manager.createdAt = nowIso();
      reusedClient = false;
    }

    await client.connect();
    const connectMs = Date.now() - connectStart;
    manager.lastConnectedAt = nowIso();

    let authorizationCheckMs: number | undefined;
    if (requireAuthorization) {
      const authStart = Date.now();
      const authorized = await client.checkAuthorization();
      authorizationCheckMs = Date.now() - authStart;
      if (!authorized) {
        manager.state = 'unauthorized';
        manager.lastErrorCode = 'UNAUTHORIZED';
        manager.lastErrorAt = nowIso();
        throw new Error('TELEGRAM_SESSION_REQUIRED');
      }
      manager.lastAuthorizedAt = nowIso();
    }

    manager.state = 'ready';
    return { client, reusedClient, connectStarted: true, connectMs, authorizationCheckMs };
  })();

  try {
    return await manager.connectPromise;
  } catch (error) {
    const classification = classifyForManager(error);
    manager.lastErrorCode = classification.code;
    manager.lastErrorAt = nowIso();
    if (classification.shouldResetClient) {
      await resetTelegramClientManager(`connect-failed:${classification.code}`);
    } else if (manager.state !== 'unauthorized') {
      manager.state = 'error';
    }
    throw error;
  } finally {
    if (manager.connectPromise) manager.connectPromise = null;
  }
}

function registerShutdownHooks(manager: TelegramClientManagerInternals) {
  if (isTest || manager.shutdownHooksRegistered) return;
  manager.shutdownHooksRegistered = true;
  const cleanup = (signal: NodeJS.Signals) => {
    void resetTelegramClientManager(`process-shutdown:${signal}`)
      .catch((error) => {
        console.warn('[Telegram client-manager] shutdown cleanup failed', {
          code: classifyForManager(error).code,
        });
      })
      .finally(() => {
        process.exit(signal === 'SIGINT' ? 130 : 143);
      });
  };
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
}

/**
 * Leases the process-warm Telegram client, ensuring it is connected and authorized before use.
 * Callers should keep work inside the callback so RPC limiting and reset-on-failure stay centralized.
 */
export async function withTelegramClient<T>(
  options: WithTelegramClientOptions,
  fn: (client: TelegramClient, meta: TelegramClientLeaseMeta) => Promise<T>,
): Promise<T> {
  const manager = getManager();
  registerShutdownHooks(manager);
  const requestId = options.requestId || createRequestId();
  const requireAuthorization = options.requireAuthorization !== false;
  manager.inFlight += 1;
  manager.lastUsedAt = nowIso();

  try {
    const ensure = await ensureConnectedAuthorized(requireAuthorization);
    const meta: TelegramClientLeaseMeta = {
      requestId,
      reusedClient: ensure.reusedClient,
      connectStarted: ensure.connectStarted,
      connectMs: ensure.connectMs,
      authorizationCheckMs: ensure.authorizationCheckMs,
      inFlight: manager.inFlight,
      generation: manager.generation,
    };

    const limiter = options.priority === 'send' ? manager.sendLimiter : manager.rpcLimiter;
    return await limiter.run(() => fn(ensure.client, meta));
  } catch (error) {
    const classification = classifyForManager(error);
    manager.lastErrorCode = classification.code;
    manager.lastErrorAt = nowIso();
    if (classification.shouldResetClient) {
      await resetTelegramClientManager(`operation-failed:${classification.code}`);
    }
    throw error;
  } finally {
    manager.inFlight = Math.max(manager.inFlight - 1, 0);
  }
}

export function getTelegramClientManagerHealth(): TelegramClientManagerHealth {
  const manager = getManager();
  return {
    state: manager.state,
    hasClient: Boolean(manager.client),
    connected: isConnected(manager.client),
    connectInFlight: Boolean(manager.connectPromise),
    inFlight: manager.inFlight,
    createdAt: manager.createdAt,
    lastUsedAt: manager.lastUsedAt,
    lastConnectedAt: manager.lastConnectedAt,
    lastAuthorizedAt: manager.lastAuthorizedAt,
    lastErrorCode: manager.lastErrorCode,
    lastErrorAt: manager.lastErrorAt,
    generation: manager.generation,
    rpcLimiter: manager.rpcLimiter.getSnapshot(),
    sendLimiter: manager.sendLimiter.getSnapshot(),
  };
}

export async function resetTelegramClientManager(reason: string): Promise<void> {
  const manager = getManager();
  const client = manager.client;
  // Generation lets in-flight observers tell that future leases may point at a different client.
  manager.generation += 1;
  manager.state = 'resetting';
  manager.client = null;
  manager.connectPromise = null;
  manager.createdAt = null;
  manager.lastAuthorizedAt = null;
  // Dialog entities are tied to the current GramJS session, so discard them with the client.
  clearTelegramDialogCache();

  try {
    await cleanupClient(client);
    manager.state = 'idle';
  } catch (error) {
    manager.state = 'error';
    manager.lastErrorCode = classifyForManager(error).code;
    manager.lastErrorAt = nowIso();
    console.warn('[Telegram client-manager] reset cleanup failed', {
      reason,
      code: manager.lastErrorCode,
    });
  }
}

export function __resetTelegramClientManagerForTests(clientFactory?: () => ManagedTelegramClient) {
  testManager = createManager();
  if (clientFactory) testManager.clientFactory = clientFactory;
}
