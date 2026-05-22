import type { TelegramChat } from './useTelegramChatInbox';

export type PriorityTelegramChatKey = 'atlas' | 'finn' | 'jace' | 'leo';

export interface PriorityTelegramChatMatcher {
  key: PriorityTelegramChatKey;
  titleIncludes: string[];
  ids: string[];
}

export interface TelegramChatPriorityGroups<TChat extends Pick<TelegramChat, 'id' | 'title'>> {
  priorityChats: TChat[];
  otherChats: TChat[];
}

export const PRIORITY_TELEGRAM_CHAT_MATCHERS: readonly PriorityTelegramChatMatcher[] = [
  { key: 'atlas', titleIncludes: ['atlas'], ids: ['atlas'] },
  { key: 'finn', titleIncludes: ['finn'], ids: ['finn'] },
  { key: 'jace', titleIncludes: ['jace'], ids: ['jace'] },
  { key: 'leo', titleIncludes: ['leo'], ids: ['leo'] },
] as const;

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function identifierParts(value: string): string[] {
  return normalizeIdentifier(value).split(/[^a-z0-9]+/).filter(Boolean);
}

function matchesConfiguredId(chatId: string, configuredIds: readonly string[]): boolean {
  const normalizedChatId = normalizeIdentifier(chatId);
  const chatIdParts = identifierParts(chatId);
  return configuredIds.some((configuredId) => {
    const normalizedConfiguredId = normalizeIdentifier(configuredId);
    return normalizedChatId === normalizedConfiguredId || chatIdParts.includes(normalizedConfiguredId);
  });
}

export function getPriorityTelegramChatKey(chat: Pick<TelegramChat, 'id' | 'title'>): PriorityTelegramChatKey | null {
  const normalizedTitle = normalizeIdentifier(chat.title);

  for (const matcher of PRIORITY_TELEGRAM_CHAT_MATCHERS) {
    if (matchesConfiguredId(chat.id, matcher.ids)) return matcher.key;
    if (matcher.titleIncludes.some((titlePart) => normalizedTitle.includes(titlePart))) return matcher.key;
  }

  return null;
}

export function groupTelegramChatsByPriority<TChat extends Pick<TelegramChat, 'id' | 'title'>>(
  chats: readonly TChat[],
): TelegramChatPriorityGroups<TChat> {
  const priorityChats: TChat[] = [];
  const otherChats: TChat[] = [];

  for (const chat of chats) {
    if (getPriorityTelegramChatKey(chat)) priorityChats.push(chat);
    else otherChats.push(chat);
  }

  return { priorityChats, otherChats };
}

export function shouldRenderTelegramChatPrioritySeparator<TChat>(groups: {
  priorityChats: readonly TChat[];
  otherChats: readonly TChat[];
}): boolean {
  return groups.priorityChats.length > 0 && groups.otherChats.length > 0;
}
