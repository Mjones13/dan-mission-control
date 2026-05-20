import type { TelegramMessage } from './useTelegramChatInbox';

export const TELEGRAM_REPLY_CONTEXT_BATCH_SIZE = 5;

export type TelegramReplyContextStatus = 'loaded' | 'missing' | 'non_text' | 'error';

export interface TelegramReplyContextMessage {
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
  status: TelegramReplyContextStatus;
}

export interface TelegramResolvedMessage {
  id: number;
  message: TelegramMessage | null;
  unavailableReason?: 'missing' | 'non_text';
}

export function toReplyContextMessage(message: TelegramMessage): TelegramReplyContextMessage {
  return { ...message, status: 'loaded' };
}

export function createUnavailableReplyContextMessage(
  id: number,
  chatId: string,
  status: Exclude<TelegramReplyContextStatus, 'loaded'> = 'missing',
): TelegramReplyContextMessage {
  return {
    id,
    chatId,
    text: status === 'non_text' ? '[Original message is not text]' : '[Original message unavailable]',
    senderId: null,
    senderName: null,
    isOutgoing: false,
    reactionCount: 0,
    sentAt: '',
    replyToMessageId: null,
    editedAt: null,
    status,
  };
}

export function resolvedMessageToContextMessage(resolved: TelegramResolvedMessage, chatId: string): TelegramReplyContextMessage {
  if (resolved.message) return toReplyContextMessage(resolved.message);
  return createUnavailableReplyContextMessage(resolved.id, chatId, resolved.unavailableReason === 'non_text' ? 'non_text' : 'missing');
}

export function createReplyContextLookup(
  localMessages: TelegramMessage[],
  resolvedMessages: Record<number, TelegramReplyContextMessage>,
): (id: number) => TelegramReplyContextMessage | null {
  const localById = new Map(localMessages.map((message) => [message.id, toReplyContextMessage(message)]));
  return (id: number) => localById.get(id) || resolvedMessages[id] || null;
}

export function getInlineReplyPreview(
  message: Pick<TelegramMessage, 'replyToMessageId'>,
  localMessages: TelegramMessage[],
  resolvedMessages: Record<number, TelegramReplyContextMessage>,
): TelegramReplyContextMessage | null {
  if (!message.replyToMessageId) return null;
  return createReplyContextLookup(localMessages, resolvedMessages)(message.replyToMessageId);
}

export function shouldOfferThreadAction(message: Pick<TelegramMessage, 'id' | 'replyToMessageId'>, localMessages: TelegramMessage[]): boolean {
  if (message.replyToMessageId) return true;
  return localMessages.some((candidate) => candidate.replyToMessageId === message.id);
}

export async function loadReplyContextBatch(
  anchor: TelegramReplyContextMessage,
  lookup: (id: number) => TelegramReplyContextMessage | null,
  resolveMissing: (id: number) => Promise<TelegramReplyContextMessage>,
  limit = TELEGRAM_REPLY_CONTEXT_BATCH_SIZE,
): Promise<{ ancestors: TelegramReplyContextMessage[]; reachedRoot: boolean }> {
  const ancestors: TelegramReplyContextMessage[] = [];
  let current: TelegramReplyContextMessage | null = anchor;

  while (current?.replyToMessageId && ancestors.length < limit) {
    const parentId: number = current.replyToMessageId;
    const parent: TelegramReplyContextMessage = lookup(parentId) || await resolveMissing(parentId);
    ancestors.push(parent);
    if (parent.status !== 'loaded') return { ancestors: ancestors.reverse(), reachedRoot: true };
    current = parent;
  }

  return { ancestors: ancestors.reverse(), reachedRoot: !current?.replyToMessageId };
}
