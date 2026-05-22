import type { TelegramClient } from 'telegram';
import type bigInt from 'big-integer';
import { withTelegramClient } from './client-manager';
import { getGroupDialogsCached, type TelegramDialog } from './dialog-cache';

/**
 * Mission Control's safe, UI-facing representation of a Telegram message.
 *
 * GramJS returns rich class instances with methods, private/internal fields, and
 * several message subclasses. This shape deliberately keeps only primitive,
 * display-safe values plus small capability flags that tell the UI whether the
 * original Telegram envelope contained media or parsed entities.
 */
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

/**
 * Minimal structural contract for a user-visible GramJS message envelope.
 *
 * This is intentionally not the full `Api.Message` type: at runtime, GramJS
 * objects can cross module/HMR boundaries where constructor identity changes,
 * so an object can be message-shaped while failing `instanceof Api.Message`.
 * We validate only the fields needed to decide whether the envelope is a
 * normal user message and then copy out safe primitives during normalization.
 */
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

// Placeholder text keeps media/entity-only Telegram messages visible instead of
// making them look missing simply because Mission Control cannot render the
// attachment/entity content yet.
const UNSUPPORTED_TELEGRAM_MEDIA_TEXT = '[Unsupported Telegram media]';
const UNSUPPORTED_TELEGRAM_MESSAGE_TEXT = '[Unsupported Telegram message]';

/** Convert Telegram peer/user identifiers to stable strings without leaking BigInt-like objects. */
function bigIntToString(value: bigInt.BigInteger | bigint | number | string | undefined): string | null {
  return value === undefined || value === null ? null : value.toString();
}

/** Narrow unknown values before reading GramJS-ish envelope fields. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

/**
 * Read a Telegram/GramJS class name without trusting prototype identity.
 *
 * Prefer explicit `className`, but fall back to `constructor.name` for
 * GramJS VirtualClass values produced by a different module instance. This is
 * the core HMR/dev safety boundary: structural evidence is more reliable than
 * `instanceof Api.Message` when the constructor object may not be the same one
 * imported by this file.
 */
function safeClassName(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const className = value.className;
  if (typeof className === 'string') return className;
  const constructorValue = value.constructor;
  if (!isRecord(constructorValue)) return null;
  const constructorName = constructorValue.name;
  return typeof constructorName === 'string' ? constructorName : null;
}

/**
 * Return a bounded, display/log-safe kind for optional Telegram capabilities.
 *
 * Media/entity support will grow over time; for now we expose only a sanitized
 * class-like label so downstream code can branch without receiving raw GramJS
 * objects or arbitrary strings.
 */
function safeKind(value: unknown): string | null {
  const name = safeClassName(value);
  if (!name) return null;
  const trimmed = name.replace(/^Api\./, '').slice(0, 80);
  return /^[A-Za-z0-9_.-]+$/.test(trimmed) ? trimmed : null;
}

/** Treat non-empty entity arrays as content/capability evidence, not renderable text. */
function hasArrayItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/** Sum only finite numeric reaction counts; malformed entries contribute nothing. */
function reactionCountFromEnvelope(reactions: unknown): number {
  if (!isRecord(reactions) || !Array.isArray(reactions.results)) return 0;
  return reactions.results.reduce((sum, reaction) => {
    if (!isRecord(reaction) || typeof reaction.count !== 'number' || !Number.isFinite(reaction.count)) return sum;
    return sum + reaction.count;
  }, 0);
}

/** Extract reply threading only when Telegram supplied an integer message id. */
function replyToMessageIdFromEnvelope(replyTo: unknown): number | null {
  if (!isRecord(replyTo)) return null;
  return Number.isInteger(replyTo.replyToMsgId) ? replyTo.replyToMsgId as number : null;
}

/**
 * Identify ordinary user messages while accepting GramJS VirtualClass wrappers.
 *
 * Service/deleted messages are rejected elsewhere; this helper only answers
 * whether the envelope has a user-message class identity by structure. The
 * `VirtualClass` branch covers dev/HMR and duplicate-dependency cases where
 * GramJS still returns the right fields but not the same constructor object.
 */
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

/**
 * Guard the outer Telegram envelope before normalization.
 *
 * Accepted shapes are ordinary user-message envelopes with an integer id and at
 * least one content signal: string text/caption, media, or non-empty entities.
 * Rejected shapes include service actions, deleted/empty messages, peers, and
 * arbitrary objects. This is a safety gate only; it does not claim Mission
 * Control can render every content capability yet.
 */
export function isTelegramMessageEnvelope(value: unknown): value is TelegramMessageEnvelope {
  if (!isRecord(value)) return false;
  if (!Number.isInteger(value.id)) return false;

  const className = typeof value.className === 'string' ? value.className : '';
  // Service/action and deleted envelopes have ids, but they are not user text
  // messages. Reject them explicitly so callers can mark resolved ids as
  // non_text rather than accidentally passing raw GramJS actions downstream.
  if (/Message(?:Service|Empty)$/i.test(className) || className === 'MessageService' || className === 'MessageEmpty') return false;
  if ('action' in value && value.action !== undefined && value.action !== null) return false;
  if (!envelopeClassLooksLikeUserMessage(value)) return false;

  const hasTextOrCaptionField = typeof value.message === 'string';
  const hasMedia = Boolean(value.media);
  const hasEntities = hasArrayItems(value.entities);
  return hasTextOrCaptionField || hasMedia || hasEntities;
}

/**
 * Normalize a Telegram message envelope into Mission Control's safe message DTO.
 *
 * This function is intentionally a copy-out boundary: it never returns or stores
 * raw GramJS envelopes, media objects, entities, actions, or class instances.
 * The structural guard decides whether an envelope is safe to inspect; this
 * normalizer then maps supported text/caption content plus conservative
 * capability flags for media/entity-only content that the UI may render later.
 */
export function normalizeTelegramMessageEnvelope(value: unknown, chatId: string): TelegramTextMessage | null {
  if (!isTelegramMessageEnvelope(value)) return null;

  const textOrCaption = typeof value.message === 'string' ? value.message : '';
  const hasMedia = Boolean(value.media);
  const hasEntities = hasArrayItems(value.entities);
  // Empty captions on media/entity messages are still meaningful Telegram
  // envelopes. Use explicit placeholders so they remain visible and resolvable
  // without pretending Mission Control can render the underlying payload.
  const text = textOrCaption || (hasMedia ? UNSUPPORTED_TELEGRAM_MEDIA_TEXT : hasEntities ? UNSUPPORTED_TELEGRAM_MESSAGE_TEXT : '');
  if (!text) return null;

  // Missing/malformed timestamps fall back to Unix epoch to preserve the
  // existing non-throwing normalization contract for partially shaped envelopes.
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
    // Capability flags are forward-compatible hints; they do not expose the raw
    // GramJS media/entity payloads or imply full UI rendering support today.
    ...(hasMedia ? { hasMedia: true, mediaKind: safeKind(value.media) } : {}),
    ...(hasEntities ? { hasEntities: true } : {}),
  };
}

/**
 * Normalize a caller-ordered batch, dropping only envelopes that fail the safe
 * message contract while preserving the order GramJS/caller already selected.
 */
export function normalizeTelegramMessageEnvelopeList(items: readonly unknown[], chatId: string): TelegramTextMessage[] {
  const normalized: TelegramTextMessage[] = [];
  items.forEach((item) => {
    const message = normalizeTelegramMessageEnvelope(item, chatId);
    if (message) normalized.push(message);
  });
  return normalized;
}

/**
 * Resolve requested ids against GramJS results with explicit unavailable states.
 *
 * A returned id with a bad/non-user envelope becomes `non_text`; an id absent
 * from the result set stays `missing`. That distinction lets reply/thread UIs
 * explain service/deleted/media limitations differently from fetch misses.
 */
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

      // GramJS may return message-shaped objects from a constructor identity
      // different from this module's import during dev/HMR. Normalize by
      // structural envelope instead of `instanceof Api.Message` so valid user
      // messages are not silently dropped.
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
      // Resolve through the same structural guard used for listing so reply
      // lookups report non_text/missing consistently across GramJS shapes.
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
