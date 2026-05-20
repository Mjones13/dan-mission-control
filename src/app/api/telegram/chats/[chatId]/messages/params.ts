export interface TelegramMessagesQueryParams {
  limit: number;
  beforeMessageId?: number;
  afterMessageId?: number;
  ids?: number[];
}

export function parseTelegramMessagesQuery(searchParams: URLSearchParams): TelegramMessagesQueryParams | { error: string } {
  const rawLimit = Number(searchParams.get('limit') || '50');
  const rawBefore = searchParams.get('before');
  const rawAfter = searchParams.get('after');
  const rawIds = searchParams.get('ids');

  if (rawIds && (rawBefore || rawAfter)) {
    return { error: 'Use ids by itself when resolving Telegram messages.' };
  }

  if (rawBefore && rawAfter) {
    return { error: 'Use either before or after when listing Telegram messages, not both.' };
  }

  const parsedBeforeMessageId = rawBefore ? Number(rawBefore) : undefined;
  const parsedAfterMessageId = rawAfter ? Number(rawAfter) : undefined;

  if (rawIds) {
    const ids = rawIds.split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0);
    if (ids.length === 0) return { error: 'ids must include at least one positive message id.' };
    const uniqueIds = Array.from(new Set(ids)).slice(0, 25);
    return { limit: uniqueIds.length, ids: uniqueIds };
  }

  if (rawBefore && (typeof parsedBeforeMessageId !== 'number' || !Number.isInteger(parsedBeforeMessageId) || parsedBeforeMessageId <= 0)) {
    return { error: 'before must be a positive message id.' };
  }

  if (rawAfter && (typeof parsedAfterMessageId !== 'number' || !Number.isInteger(parsedAfterMessageId) || parsedAfterMessageId <= 0)) {
    return { error: 'after must be a positive message id.' };
  }

  const beforeMessageId = parsedBeforeMessageId;
  const afterMessageId = parsedAfterMessageId;

  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;

  return { limit, beforeMessageId, afterMessageId };
}
