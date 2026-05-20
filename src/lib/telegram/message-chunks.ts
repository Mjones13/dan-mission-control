export const TELEGRAM_TEXT_MESSAGE_LIMIT = 4096;

/**
 * Splits text into Telegram-safe message chunks.
 *
 * The splitter prefers whitespace/newline boundaries near the Telegram text
 * limit and hard-splits only when a single run of non-whitespace text exceeds
 * the limit. Leading whitespace after a soft split is omitted so follow-up
 * messages do not start with stray separators.
 */
export function splitTelegramMessageText(text: string, limit = TELEGRAM_TEXT_MESSAGE_LIMIT): string[] {
  if (limit < 1) throw new Error('Chunk limit must be positive');
  if (text.length <= limit) return text ? [text] : [];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const remaining = text.length - start;
    if (remaining <= limit) {
      const finalChunk = text.slice(start);
      if (finalChunk) chunks.push(finalChunk);
      break;
    }

    const hardEnd = start + limit;
    const window = text.slice(start, hardEnd + 1);
    let splitAt = -1;

    for (let index = window.length - 1; index >= 0; index -= 1) {
      if (/\s/.test(window[index])) {
        splitAt = start + index;
        break;
      }
    }

    if (splitAt <= start) {
      splitAt = hardEnd;
      chunks.push(text.slice(start, splitAt));
      start = splitAt;
    } else {
      chunks.push(text.slice(start, splitAt));
      start = splitAt;
      while (start < text.length && /\s/.test(text[start])) start += 1;
    }
  }

  return chunks;
}
