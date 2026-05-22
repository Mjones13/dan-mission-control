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
  hasMedia?: boolean;
  mediaKind?: string | null;
  hasEntities?: boolean;
}

export interface TelegramResolvedTextMessage {
  id: number;
  message: TelegramTextMessage | null;
  unavailableReason?: 'missing' | 'non_text';
}

type TelegramMessageEnvelope = {
  id: number;
  className?: string;
  message?: unknown;
  date?: unknown;
  editDate?: unknown;
  senderId?: unknown;
  out?: unknown;
  reactions?: unknown;
  replyTo?: unknown;
  media?: unknown;
  entities?: unknown;
  action?: unknown;
};

const UNSUPPORTED_TELEGRAM_MEDIA_TEXT = '[Unsupported Telegram media]';
const UNSUPPORTED_TELEGRAM_MESSAGE_TEXT = '[Unsupported Telegram message]';

function bigIntToString(value: bigInt.BigInteger | bigint | number | string | undefined): string | null {
  return value === undefined || value === null ? null : value.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function safeClassName(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const className = value.className;
  if (typeof className === 'string') return className;
  const constructorValue = value.constructor;
  if (!isRecord(constructorValue)) return null;
  const constructorName = constructorValue.name;
  return typeof constructorName === 'string' ? constructorName : null;
}

function safeKind(value: unknown): string | null {
  const name = safeClassName(value);
  if (!name) return null;
  const trimmed = name.replace(/^Api\./, '').slice(0, 80);
  return /^[A-Za-z0-9_.-]+$/.test(trimmed) ? trimmed : null;
}

function hasArrayItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function reactionCountFromEnvelope(reactions: unknown): number {
  if (!isRecord(reactions) || !Array.isArray(reactions.results)) return 0;
  return reactions.results.reduce((sum, reaction) => {
    if (!isRecord(reaction) || typeof reaction.count !== 'number' || !Number.isFinite(reaction.count)) return sum;
    return sum + reaction.count;
  }, 0);
}

function replyToMessageIdFromEnvelope(replyTo: unknown): number | null {
  if (!isRecord(replyTo)) return null;
  return Number.isInteger(replyTo.replyToMsgId) ? replyTo.replyToMsgId as number : null;
}

function envelopeClassLooksLikeUserMessage(value: Record<string, unknown>): boolean {
  const className = typeof value.className === 'string' ? value.className : null;
  const constructorName = safeClassName(value);
  return (
    className === 'Message' ||
    className === 'Api.Message' ||
    Boolean(className?.endsWith('.Message')) ||
    constructorName === 'Message' ||
    constructorName === 'VirtualClass'
  );
}

export function isTelegramMessageEnvelope(value: unknown): value is TelegramMessageEnvelope {
  if (!isRecord(value)) return false;
  if (!Number.isInteger(value.id)) return false;

  const className = typeof value.className === 'string' ? value.className : '';
  if (/Message(?:Service|Empty)$/i.test(className) || className === 'MessageService' || className === 'MessageEmpty') return false;
  if ('action' in value && value.action !== undefined && value.action !== null) return false;
  if (!envelopeClassLooksLikeUserMessage(value)) return false;

  const hasTextOrCaptionField = typeof value.message === 'string';
  const hasMedia = Boolean(value.media);
  const hasEntities = hasArrayItems(value.entities);
  return hasTextOrCaptionField || hasMedia || hasEntities;
}

export function normalizeTelegramMessageEnvelope(value: unknown, chatId: string): TelegramTextMessage | null {
  if (!isTelegramMessageEnvelope(value)) return null;

  const textOrCaption = typeof value.message === 'string' ? value.message : '';
  const hasMedia = Boolean(value.media);
  const hasEntities = hasArrayItems(value.entities);
  const text = textOrCaption || (hasMedia ? UNSUPPORTED_TELEGRAM_MEDIA_TEXT : hasEntities ? UNSUPPORTED_TELEGRAM_MESSAGE_TEXT : '');
  if (!text) return null;

  const date = typeof value.date === 'number' && Number.isFinite(value.date) ? value.date : 0;
  const editDate = typeof value.editDate === 'number' && Number.isFinite(value.editDate) ? value.editDate : null;

  return {
    id: value.id,
    chatId,
    text,
    senderId: bigIntToString(value.senderId as bigInt.BigInteger | bigint | number | string | undefined),
    senderName: null,
    isOutgoing: Boolean(value.out),
    reactionCount: reactionCountFromEnvelope(value.reactions),
    sentAt: new Date(date * 1000).toISOString(),
    replyToMessageId: replyToMessageIdFromEnvelope(value.replyTo),
    editedAt: editDate ? new Date(editDate * 1000).toISOString() : null,
    ...(hasMedia ? { hasMedia: true, mediaKind: safeKind(value.media) } : {}),
    ...(hasEntities ? { hasEntities: true } : {}),
  };
}

export function normalizeTelegramMessageEnvelopeList(items: readonly unknown[], chatId: string): TelegramTextMessage[] {
  const normalized: TelegramTextMessage[] = [];
  items.forEach((item) => {
    const message = normalizeTelegramMessageEnvelope(item, chatId);
    if (message) normalized.push(message);
  });
  return normalized;
}

export function resolveTelegramMessageEnvelopes(chatId: string, ids: number[], items: readonly unknown[]): TelegramResolvedTextMessage[] {
  const byId = new Map<number, TelegramResolvedTextMessage>();

  items.forEach((item) => {
    if (!isRecord(item) || !Number.isInteger(item.id)) return;
    const id = item.id as number;
    const normalized = normalizeTelegramMessageEnvelope(item, chatId);
    byId.set(id, normalized
      ? { id, message: normalized }
      : { id, message: null, unavailableReason: 'non_text' });
  });

  return ids.map((id) => byId.get(id) || { id, message: null, unavailableReason: 'missing' });
}

async function findAuthorizedGroupDialog(client: TelegramClient, chatId: string): Promise<TelegramDialog> {
  const dialogs = await getGroupDialogsCached(client, { limit: 100 });
  const dialog = dialogs.find((candidate) => candidate.id?.toString() === chatId);

  if (!dialog) {
    throw new Error('TELEGRAM_GROUP_CHAT_NOT_FOUND');
  }

  return dialog;
}

export interface ListTelegramGroupChatMessagesOptions {
  limit?: number;
  beforeMessageId?: number;
  afterMessageId?: number;
}

export async function listTelegramGroupChatMessages(chatId: string, options: ListTelegramGroupChatMessagesOptions = {}): Promise<TelegramTextMessage[]> {
  const { limit = 50, beforeMessageId, afterMessageId } = options;

  return withTelegramClient(
    { operation: 'telegram.messages.list', priority: 'interactive' },
    async (client) => {
      const dialog = await findAuthorizedGroupDialog(client, chatId);

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

      const textMessages = normalizeTelegramMessageEnvelopeList(messages, chatId);

      return afterMessageId ? textMessages : textMessages.reverse();
    },
  );
}

export async function resolveTelegramGroupChatMessages(chatId: string, ids: number[]): Promise<TelegramResolvedTextMessage[]> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0))).slice(0, 25);
  if (uniqueIds.length === 0) return [];

  return withTelegramClient(
    { operation: 'telegram.messages.resolve', priority: 'read' },
    async (client) => {
      const dialog = await findAuthorizedGroupDialog(client, chatId);
      const messages = await client.getMessages(dialog.inputEntity, { ids: uniqueIds });
      return resolveTelegramMessageEnvelopes(chatId, uniqueIds, messages);
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

      const normalized = normalizeTelegramMessageEnvelope(sent, chatId);
      if (!normalized) {
        throw new Error('TELEGRAM_SEND_RESULT_UNREADABLE');
      }

      return normalized;
    },
  );
}
