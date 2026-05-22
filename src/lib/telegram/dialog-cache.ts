import type { TelegramClient } from 'telegram';

export type TelegramDialog = Awaited<ReturnType<TelegramClient['getDialogs']>>[number];

interface DialogCacheEntry {
  limit: number;
  createdAtMs: number;
  rawCount: number;
  dialogs: TelegramDialog[];
}

interface DialogFetchResult {
  rawCount: number;
  dialogs: TelegramDialog[];
}

interface DialogInFlightEntry {
  limit: number;
  promise: Promise<DialogFetchResult>;
}

let cache: DialogCacheEntry | null = null;
let inFlight: DialogInFlightEntry | null = null;

const DEFAULT_MAX_AGE_MS = 3_000;

interface DialogDiagnosticsOptions {
  requestId?: string;
  targetChatId?: string;
}

interface GetGroupDialogsCachedOptions extends DialogDiagnosticsOptions {
  limit?: number;
  maxAgeMs?: number;
}

function logDialogsResult(options: {
  requestId?: string;
  cacheHit: boolean;
  requestedLimit: number;
  rawCount: number;
  groupCount: number;
  targetChatId?: string;
  dialogs: TelegramDialog[];
}) {
  const targetPresent = options.targetChatId
    ? options.dialogs.some((dialog) => dialog.id?.toString() === options.targetChatId)
    : null;

  console.log('[tg:dialogs:result]', {
    requestId: options.requestId,
    cacheHit: options.cacheHit,
    requestedLimit: options.requestedLimit,
    rawCount: options.rawCount,
    groupCount: options.groupCount,
    targetChatId: options.targetChatId,
    targetPresent,
    firstIds: options.dialogs.slice(0, 10).map((dialog) => dialog.id?.toString() ?? null),
  });
}

/**
 * Caches the short-lived group dialog list so chat/message calls can reuse GramJS input entities.
 * A cached result with a higher limit can satisfy smaller requests without another Telegram RPC.
 */
export async function getGroupDialogsCached(
  client: TelegramClient,
  options: GetGroupDialogsCachedOptions = {},
): Promise<TelegramDialog[]> {
  const limit = options.limit || 100;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = Date.now();

  if (cache && cache.limit >= limit && now - cache.createdAtMs <= maxAgeMs) {
    const dialogs = cache.dialogs.slice(0, limit);
    logDialogsResult({
      requestId: options.requestId,
      cacheHit: true,
      requestedLimit: limit,
      rawCount: cache.rawCount,
      groupCount: cache.dialogs.length,
      targetChatId: options.targetChatId,
      dialogs,
    });
    return dialogs;
  }

  if (inFlight && inFlight.limit >= limit) {
    // Collapse concurrent refreshes; callers slice their requested window after the shared fetch resolves.
    const result = await inFlight.promise;
    const dialogs = result.dialogs;
    const sliced = dialogs.slice(0, limit);
    logDialogsResult({
      requestId: options.requestId,
      cacheHit: false,
      requestedLimit: limit,
      rawCount: result.rawCount,
      groupCount: dialogs.length,
      targetChatId: options.targetChatId,
      dialogs: sliced,
    });
    return sliced;
  }

  const promise = client.getDialogs({ limit }).then((dialogs) => {
    // Store only group dialogs because all current consumers require group input entities.
    const groupDialogs = dialogs.filter((dialog) => dialog.isGroup);
    cache = { limit, createdAtMs: Date.now(), rawCount: dialogs.length, dialogs: groupDialogs };
    return { rawCount: dialogs.length, dialogs: groupDialogs };
  }).finally(() => {
    if (inFlight?.promise === promise) {
      inFlight = null;
    }
  });

  inFlight = { limit, promise };
  const result = await promise;
  const dialogs = result.dialogs;
  const sliced = dialogs.slice(0, limit);
  logDialogsResult({
    requestId: options.requestId,
    cacheHit: false,
    requestedLimit: limit,
    rawCount: result.rawCount,
    groupCount: dialogs.length,
    targetChatId: options.targetChatId,
    dialogs: sliced,
  });
  return sliced;
}

export function clearTelegramDialogCache() {
  cache = null;
  inFlight = null;
}
