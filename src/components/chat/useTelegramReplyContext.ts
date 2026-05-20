'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TelegramMessage } from './useTelegramChatInbox';
import {
  TELEGRAM_REPLY_CONTEXT_BATCH_SIZE,
  createReplyContextLookup,
  createUnavailableReplyContextMessage,
  latestLoadedThreadMessage,
  loadReplyContextBatch,
  resolvedMessageToContextMessage,
  shouldOfferThreadAction,
  toReplyContextMessage,
  type TelegramReplyContextMessage,
  type TelegramResolvedMessage,
} from './telegramReplyContext';

interface UseTelegramReplyContextOptions {
  chatId: string | null;
  messages: TelegramMessage[];
}

export interface UseTelegramReplyContextResult {
  inlinePreviewByMessageId: Record<number, TelegramReplyContextMessage>;
  threadAnchor: TelegramReplyContextMessage | null;
  threadMessages: TelegramReplyContextMessage[];
  threadLoading: boolean;
  threadLoadingEarlier: boolean;
  threadError: string | null;
  threadHasEarlier: boolean;
  threadReplyTarget: TelegramMessage | null;
  canOpenThread(message: TelegramMessage): boolean;
  openThread(message: TelegramMessage): Promise<void>;
  closeThread(): void;
  loadEarlierInThread(): Promise<void>;
  appendMessagesToThread(messages: TelegramMessage[]): void;
}

async function fetchResolvedMessages(chatId: string, ids: number[]): Promise<TelegramResolvedMessage[]> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
  if (uniqueIds.length === 0) return [];
  const query = new URLSearchParams({ ids: uniqueIds.join(',') });
  const res = await fetch(`/api/telegram/chats/${encodeURIComponent(chatId)}/messages?${query.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || data.error || 'Failed to resolve Telegram reply context');
  return data.messages || [];
}

export function useTelegramReplyContext({ chatId, messages }: UseTelegramReplyContextOptions): UseTelegramReplyContextResult {
  const [resolvedById, setResolvedById] = useState<Record<number, TelegramReplyContextMessage>>({});
  const [threadAnchor, setThreadAnchor] = useState<TelegramReplyContextMessage | null>(null);
  const [threadMessages, setThreadMessages] = useState<TelegramReplyContextMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadLoadingEarlier, setThreadLoadingEarlier] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [threadHasEarlier, setThreadHasEarlier] = useState(false);

  useEffect(() => {
    setResolvedById({});
    setThreadAnchor(null);
    setThreadMessages([]);
    setThreadError(null);
    setThreadHasEarlier(false);
  }, [chatId]);

  const lookup = useMemo(() => createReplyContextLookup(messages, resolvedById), [messages, resolvedById]);

  const resolveOne = useCallback(async (id: number): Promise<TelegramReplyContextMessage> => {
    if (!chatId) return createUnavailableReplyContextMessage(id, '', 'missing');
    const local = lookup(id);
    if (local) return local;
    try {
      const [resolved] = await fetchResolvedMessages(chatId, [id]);
      const contextMessage = resolved ? resolvedMessageToContextMessage(resolved, chatId) : createUnavailableReplyContextMessage(id, chatId, 'missing');
      setResolvedById((current) => ({ ...current, [id]: contextMessage }));
      return contextMessage;
    } catch {
      const contextMessage = createUnavailableReplyContextMessage(id, chatId, 'error');
      setResolvedById((current) => ({ ...current, [id]: contextMessage }));
      return contextMessage;
    }
  }, [chatId, lookup]);

  useEffect(() => {
    if (!chatId) return;
    const localIds = new Set(messages.map((message) => message.id));
    const missingPreviewIds = Array.from(new Set(messages
      .map((message) => message.replyToMessageId)
      .filter((id): id is number => Boolean(id && !localIds.has(id) && !resolvedById[id]))))
      .slice(0, 20);
    if (missingPreviewIds.length === 0) return;
    let cancelled = false;
    void fetchResolvedMessages(chatId, missingPreviewIds)
      .then((resolved) => {
        if (cancelled) return;
        const byId: Record<number, TelegramReplyContextMessage> = {};
        const returnedIds = new Set<number>();
        for (const item of resolved) {
          returnedIds.add(item.id);
          byId[item.id] = resolvedMessageToContextMessage(item, chatId);
        }
        for (const id of missingPreviewIds) {
          if (!returnedIds.has(id)) byId[id] = createUnavailableReplyContextMessage(id, chatId, 'missing');
        }
        setResolvedById((current) => ({ ...current, ...byId }));
      })
      .catch(() => {
        if (cancelled) return;
        const byId = Object.fromEntries(missingPreviewIds.map((id) => [id, createUnavailableReplyContextMessage(id, chatId, 'error')]));
        setResolvedById((current) => ({ ...current, ...byId }));
      });
    return () => { cancelled = true; };
  }, [chatId, messages, resolvedById]);

  const inlinePreviewByMessageId = useMemo(() => {
    const previewByMessageId: Record<number, TelegramReplyContextMessage> = {};
    for (const message of messages) {
      if (!message.replyToMessageId) continue;
      const preview = lookup(message.replyToMessageId);
      if (preview) previewByMessageId[message.id] = preview;
    }
    return previewByMessageId;
  }, [lookup, messages]);

  const threadReplyTarget = useMemo(() => latestLoadedThreadMessage(threadMessages), [threadMessages]);

  const canOpenThread = useCallback((message: TelegramMessage) => shouldOfferThreadAction(message, messages), [messages]);

  const openThread = useCallback(async (message: TelegramMessage) => {
    if (!chatId) return;
    const anchor = toReplyContextMessage(message);
    setThreadAnchor(anchor);
    setThreadMessages([anchor]);
    setThreadLoading(true);
    setThreadLoadingEarlier(false);
    setThreadError(null);
    try {
      const { ancestors, reachedRoot } = await loadReplyContextBatch(anchor, lookup, resolveOne, TELEGRAM_REPLY_CONTEXT_BATCH_SIZE - 1);
      setThreadMessages([...ancestors, anchor]);
      setThreadHasEarlier(!reachedRoot);
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Failed to load reply context');
      setThreadHasEarlier(false);
    } finally {
      setThreadLoading(false);
    }
  }, [chatId, lookup, resolveOne]);

  const closeThread = useCallback(() => {
    setThreadAnchor(null);
    setThreadMessages([]);
    setThreadError(null);
    setThreadHasEarlier(false);
  }, []);

  const loadEarlierInThread = useCallback(async () => {
    if (!chatId || threadLoadingEarlier || !threadMessages.length) return;
    const oldest = threadMessages[0];
    setThreadLoadingEarlier(true);
    setThreadError(null);
    try {
      const { ancestors, reachedRoot } = await loadReplyContextBatch(oldest, lookup, resolveOne, TELEGRAM_REPLY_CONTEXT_BATCH_SIZE);
      setThreadMessages((current) => [...ancestors, ...current]);
      setThreadHasEarlier(!reachedRoot);
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Failed to load earlier reply context');
    } finally {
      setThreadLoadingEarlier(false);
    }
  }, [chatId, lookup, resolveOne, threadLoadingEarlier, threadMessages]);

  const appendMessagesToThread = useCallback((sentMessages: TelegramMessage[]) => {
    if (sentMessages.length === 0) return;
    setThreadMessages((current) => {
      if (current.length === 0) return current;
      const existingIds = new Set(current.map((message) => message.id));
      const appended = sentMessages.filter((message) => !existingIds.has(message.id)).map(toReplyContextMessage);
      return appended.length ? [...current, ...appended] : current;
    });
  }, []);

  return {
    inlinePreviewByMessageId,
    threadAnchor,
    threadMessages,
    threadLoading,
    threadLoadingEarlier,
    threadError,
    threadHasEarlier,
    threadReplyTarget,
    canOpenThread,
    openThread,
    closeThread,
    loadEarlierInThread,
    appendMessagesToThread,
  };
}
