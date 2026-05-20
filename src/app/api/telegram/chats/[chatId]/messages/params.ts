export interface TelegramMessagesQueryParams {
  limit: number;
  beforeMessageId?: number;
  afterMessageId?: number;
}

export function parseTelegramMessagesQuery(searchParams: URLSearchParams): TelegramMessagesQueryParams | { error: string } {
  const rawLimit = Number(searchParams.get('limit') || '50');
  const rawBefore = searchParams.get('before');
  const rawAfter = searchParams.get('after');

  if (rawBefore && rawAfter) {
    return { error: 'Use either before or after when listing Telegram messages, not both.' };
  }

  const parsedBeforeMessageId = rawBefore ? Number(rawBefore) : undefined;
  const parsedAfterMessageId = rawAfter ? Number(rawAfter) : undefined;

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
