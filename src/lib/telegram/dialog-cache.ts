import type { TelegramClient } from 'telegram';

export type TelegramDialog = Awaited<ReturnType<TelegramClient['getDialogs']>>[number];

interface DialogCacheEntry {
  limit: number;
  createdAtMs: number;
  dialogs: TelegramDialog[];
}

interface DialogInFlightEntry {
  limit: number;
  promise: Promise<TelegramDialog[]>;
}

let cache: DialogCacheEntry | null = null;
let inFlight: DialogInFlightEntry | null = null;

const DEFAULT_MAX_AGE_MS = 3_000;

export async function getGroupDialogsCached(
  client: TelegramClient,
  options: { limit?: number; maxAgeMs?: number } = {},
): Promise<TelegramDialog[]> {
  const limit = options.limit || 100;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = Date.now();

  if (cache && cache.limit >= limit && now - cache.createdAtMs <= maxAgeMs) {
    return cache.dialogs.slice(0, limit);
  }

  if (inFlight && inFlight.limit >= limit) {
    const dialogs = await inFlight.promise;
    return dialogs.slice(0, limit);
  }

  const promise = client.getDialogs({ limit }).then((dialogs) => {
    const groupDialogs = dialogs.filter((dialog) => dialog.isGroup);
    cache = { limit, createdAtMs: Date.now(), dialogs: groupDialogs };
    return groupDialogs;
  }).finally(() => {
    if (inFlight?.promise === promise) {
      inFlight = null;
    }
  });

  inFlight = { limit, promise };
  const dialogs = await promise;
  return dialogs.slice(0, limit);
}

export function clearTelegramDialogCache() {
  cache = null;
  inFlight = null;
}
