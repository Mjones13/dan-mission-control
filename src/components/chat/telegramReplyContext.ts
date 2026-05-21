import type { TelegramMessage } from './useTelegramChatInbox';

export const TELEGRAM_REPLY_CONTEXT_BATCH_SIZE = 5;

export type TelegramReplyContextStatus = 'loaded' | 'missing' | 'non_text' | 'error';

// Context rows use the normal Telegram message shape plus availability state so
// the modal can render deleted/media/error parents without pretending they are
// real text messages or persisting a broader Telegram history mirror.
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

export function inferTelegramChatActorLabel(chatTitle?: string | null): string | null {
  const normalized = chatTitle?.toLowerCase() || '';
  // These work-chat titles are stable today, and mapping them avoids leaking
  // the transport name "Telegram" into message bubbles when senderName is null.
  if (normalized.includes('finn')) return 'Finn';
  if (normalized.includes('jace')) return 'Jace';
  if (normalized.includes('leo')) return 'Leo';
  return null;
}

export function telegramDisplaySenderLabel(
  message: Pick<TelegramMessage, 'isOutgoing' | 'senderName'>,
  chatTitle?: string | null,
): string | null {
  if (message.isOutgoing) return null;
  return message.senderName?.trim() || inferTelegramChatActorLabel(chatTitle);
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
  // Prefer the live chat cache before resolved fallbacks so inline previews and
  // modal rows pick up fresher text/reactions when the parent is already loaded.
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

export function createLoadedDirectRepliesByParentId(localMessages: TelegramMessage[]): Map<number, TelegramMessage[]> {
  const repliesByParentId = new Map<number, TelegramMessage[]>();

  for (const message of localMessages) {
    if (message.replyToMessageId === null) continue;
    const replies = repliesByParentId.get(message.replyToMessageId) || [];
    replies.push(message);
    repliesByParentId.set(message.replyToMessageId, replies);
  }

  repliesByParentId.forEach((replies) => {
    replies.sort((a, b) => a.id - b.id);
  });

  return repliesByParentId;
}

export function getLoadedDirectReplies(message: Pick<TelegramMessage, 'id'>, localMessages: TelegramMessage[]): TelegramMessage[] {
  return createLoadedDirectRepliesByParentId(localMessages).get(message.id) || [];
}

export function latestLoadedThreadMessage(threadMessages: TelegramReplyContextMessage[]): TelegramMessage | null {
  // The composer should continue the visible chain, so unavailable placeholder
  // rows are skipped and the newest real Telegram message becomes the replyTo.
  for (let index = threadMessages.length - 1; index >= 0; index -= 1) {
    const candidate = threadMessages[index];
    if (candidate.status !== 'loaded') continue;
    const { status: _status, ...message } = candidate;
    return message;
  }
  return null;
}

export function appendDirectThreadExtensions(
  threadMessages: TelegramReplyContextMessage[],
  localMessages: TelegramMessage[],
): TelegramReplyContextMessage[] {
  // V1 is intentionally conservative: auto-append only a single unambiguous
  // direct reply to the current latest row. Multiple direct replies indicate a
  // branch/sibling situation that needs a later child-discovery UI instead of
  // silently choosing one branch.
  if (threadMessages.length === 0) return threadMessages;
  const existingIds = new Set(threadMessages.map((message) => message.id));
  let nextThreadMessages = threadMessages;

  while (true) {
    const latest = latestLoadedThreadMessage(nextThreadMessages);
    if (!latest) return nextThreadMessages;
    const directExtensions = localMessages
      .filter((message) => !existingIds.has(message.id) && message.replyToMessageId === latest.id)
      .sort((a, b) => a.id - b.id);

    if (directExtensions.length !== 1) return nextThreadMessages;
    const [extension] = directExtensions;
    existingIds.add(extension.id);
    nextThreadMessages = [...nextThreadMessages, toReplyContextMessage(extension)];
  }
}

export async function loadReplyContextBatch(
  anchor: TelegramReplyContextMessage,
  lookup: (id: number) => TelegramReplyContextMessage | null,
  resolveMissing: (id: number) => Promise<TelegramReplyContextMessage>,
  limit = TELEGRAM_REPLY_CONTEXT_BATCH_SIZE,
): Promise<{ ancestors: TelegramReplyContextMessage[]; reachedRoot: boolean }> {
  // Follow parent links upward only. Telegram child-reply discovery is not
  // reliable for ordinary groups, so V1 loads bounded ancestry batches and
  // leaves sibling/downward branch discovery for a separate feature.
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
