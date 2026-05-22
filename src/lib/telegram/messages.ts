import { Api } from 'telegram';
import type { TelegramClient } from 'telegram';
import type bigInt from 'big-integer';
import { withTelegramClient } from './client-manager';
import { getGroupDialogsCached, type TelegramDialog } from './dialog-cache';

export interface TelegramTextMessage {
  id: number;
  chatId: string;
  text: string;
  senderId: string | null;
  senderName: string | null;
  isOutgoing: boolean;
  reactionCount: number;
  sentAt: string;
  replyToMessageId: number | null;
  editedAt: string | null;
}

export interface TelegramResolvedTextMessage {
  id: number;
  message: TelegramTextMessage | null;
  unavailableReason?: 'missing' | 'non_text';
}

function bigIntToString(value: bigInt.BigInteger | undefined): string | null {
  return value ? value.toString() : null;
}

function messageToTextMessage(message: Api.Message, chatId: string): TelegramTextMessage | null {
  if (!message.message) return null;
  const reactionCount = message.reactions?.results?.reduce((sum, reaction) => sum + reaction.count, 0) || 0;

  return {
    id: message.id,
    chatId,
    text: message.message,
    senderId: bigIntToString(message.senderId as bigInt.BigInteger | undefined),
    senderName: null,
    isOutgoing: Boolean(message.out),
    reactionCount,
    sentAt: new Date(message.date * 1000).toISOString(),
    replyToMessageId: message.replyTo?.replyToMsgId || null,
    editedAt: message.editDate ? new Date(message.editDate * 1000).toISOString() : null,
  };
}

function typeName(value: unknown): string | null {
  return value && typeof value === 'object' ? value.constructor?.name || null : null;
}

function logRawMessagesResult(requestId: string | undefined, chatId: string, messages: unknown[]) {
  const rawTypeCounts = messages.reduce<Record<string, number>>((counts, message) => {
    const key = typeName(message) || typeof message;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const apiMessages = messages.filter((message): message is Api.Message => message instanceof Api.Message);
  const ids = apiMessages.map((message) => message.id).filter((id) => Number.isInteger(id));

  console.log('[tg:messages:gramjs-result]', {
    requestId,
    chatId,
    rawCount: messages.length,
    rawTypeCounts,
    apiMessageCount: apiMessages.length,
    textMessageCount: apiMessages.filter((message) => Boolean(message.message)).length,
    emptyTextCount: apiMessages.filter((message) => !message.message).length,
    minId: ids.length ? Math.min(...ids) : null,
    maxId: ids.length ? Math.max(...ids) : null,
  });
}

async function findAuthorizedGroupDialog(client: TelegramClient, chatId: string, options: { requestId?: string } = {}): Promise<TelegramDialog> {
  const dialogs = await getGroupDialogsCached(client, { limit: 100, requestId: options.requestId, targetChatId: chatId });
  const dialog = dialogs.find((candidate) => candidate.id?.toString() === chatId);

  if (!dialog) {
    throw new Error('TELEGRAM_GROUP_CHAT_NOT_FOUND');
  }

  console.log('[tg:messages:dialog-selected]', {
    requestId: options.requestId,
    chatId,
    dialogId: dialog.id?.toString() ?? null,
    isGroup: Boolean(dialog.isGroup),
    isChannel: Boolean(dialog.isChannel),
    entityType: typeName(dialog.entity),
    inputEntityType: typeName(dialog.inputEntity),
  });

  return dialog;
}

export interface ListTelegramGroupChatMessagesOptions {
  limit?: number;
  beforeMessageId?: number;
  afterMessageId?: number;
  requestId?: string;
}

export async function listTelegramGroupChatMessages(chatId: string, options: ListTelegramGroupChatMessagesOptions = {}): Promise<TelegramTextMessage[]> {
  const { limit = 50, beforeMessageId, afterMessageId, requestId } = options;

  return withTelegramClient(
    { operation: 'telegram.messages.list', priority: 'interactive', requestId },
    async (client) => {
      const dialog = await findAuthorizedGroupDialog(client, chatId, { requestId });

      const messages = await client.getMessages(dialog.inputEntity, afterMessageId
        ? {
            limit,
            minId: afterMessageId,
            reverse: true,
          }
        : {
            limit,
            offsetId: beforeMessageId || 0,
          });
      logRawMessagesResult(requestId, chatId, Array.from(messages));

      const textMessages = messages
        .filter((message): message is Api.Message => message instanceof Api.Message)
        .map((message) => messageToTextMessage(message, chatId))
        .filter((message): message is TelegramTextMessage => message !== null);

      return afterMessageId ? textMessages : textMessages.reverse();
    },
  );
}

export async function resolveTelegramGroupChatMessages(chatId: string, ids: number[], options: { requestId?: string } = {}): Promise<TelegramResolvedTextMessage[]> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0))).slice(0, 25);
  if (uniqueIds.length === 0) return [];
  const { requestId } = options;

  return withTelegramClient(
    { operation: 'telegram.messages.resolve', priority: 'read', requestId },
    async (client) => {
      const dialog = await findAuthorizedGroupDialog(client, chatId, { requestId });
      const messages = await client.getMessages(dialog.inputEntity, { ids: uniqueIds });
      console.log('[tg:messages:resolve-result]', {
        requestId,
        chatId,
        requestedCount: uniqueIds.length,
        rawCount: messages.length,
        foundIds: Array.from(messages)
          .filter((item): item is Api.Message => item instanceof Api.Message)
          .map((item) => item.id),
      });
      const byId = new Map<number, TelegramResolvedTextMessage>();

      for (const item of messages) {
        if (!(item instanceof Api.Message)) continue;
        const normalized = messageToTextMessage(item, chatId);
        byId.set(item.id, normalized
          ? { id: item.id, message: normalized }
          : { id: item.id, message: null, unavailableReason: 'non_text' });
      }

      return uniqueIds.map((id) => byId.get(id) || { id, message: null, unavailableReason: 'missing' });
    },
  );
}

export async function markTelegramGroupChatRead(chatId: string, maxMessageId?: number): Promise<void> {
  return withTelegramClient(
    { operation: 'telegram.messages.markRead', priority: 'background' },
    async (client) => {
      const dialog = await findAuthorizedGroupDialog(client, chatId);
      await client.markAsRead(dialog.inputEntity, undefined, {
        maxId: maxMessageId || 0,
      });
    },
  );
}

export async function sendTelegramGroupChatMessage(chatId: string, text: string, replyToMessageId?: number): Promise<TelegramTextMessage> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('TELEGRAM_EMPTY_MESSAGE');
  }
  if (trimmed.length > 4096) {
    throw new Error('TELEGRAM_MESSAGE_TOO_LONG');
  }

  return withTelegramClient(
    { operation: 'telegram.messages.send', priority: 'send' },
    async (client) => {
      const dialog = await findAuthorizedGroupDialog(client, chatId);
      const sent = await client.sendMessage(dialog.inputEntity, {
        message: trimmed,
        replyTo: replyToMessageId,
        parseMode: false,
        linkPreview: false,
      });

      const normalized = messageToTextMessage(sent, chatId);
      if (!normalized) {
        throw new Error('TELEGRAM_SEND_RESULT_UNREADABLE');
      }

      return normalized;
    },
  );
}
