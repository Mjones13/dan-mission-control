'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { splitTelegramMessageText } from '@/lib/telegram/message-chunks';
import {
  DEFAULT_TELEGRAM_POLLING_POLICY,
  isTelegramPollIntervalEnabled,
  type TelegramPollingPolicy,
} from '@/lib/telegram/policy';

export interface TelegramChat {
  id: string;
  title: string;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

export interface TelegramMessage {
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

export interface ChatMessageCacheEntry {
  messages: TelegramMessage[];
  hasOlderMessages: boolean;
  latestAcknowledgedOutgoingMessageId: number | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isLoadingOlder: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  lastAccessedAt: number;
  scrollTop?: number;
}

export type SendMessageResult =
  | { ok: true; sentMessages: TelegramMessage[] }
  | { ok: false; unsentText: string; sentAnyChunks: boolean; error: string };

export interface UseTelegramChatInboxResult {
  chats: TelegramChat[];
  selectedChat: TelegramChat | null;
  selectedChatId: string | null;
  selectedChatTitle: string;
  selectedMessages: TelegramMessage[];
  selectedCacheEntry: ChatMessageCacheEntry | null;
  loadingChats: boolean;
  loadingMessages: boolean;
  loadingOlder: boolean;
  hasOlderMessages: boolean;
  sending: boolean;
  error: string | null;
  selectChat(chat: TelegramChat): void;
  clearSelection(): void;
  loadOlderMessages(): Promise<void>;
  sendMessage(text: string, replyTo?: TelegramMessage | null): Promise<SendMessageResult>;
  setChatScrollTop(chatId: string, scrollTop: number): void;
  refreshChats(options?: { background?: boolean }): Promise<void>;
  refreshSelectedMessages(options?: { background?: boolean }): Promise<void>;
}

const MESSAGE_BATCH_SIZE = 50;
const REQUEST_TIMEOUT_MS = 12000;
const MARK_READ_TIMEOUT_MS = 30000;
const MAX_CACHED_CHATS = 20;
const MAX_MESSAGES_PER_CHAT = 500;
const SELECTED_MESSAGE_REFRESH_STALE_MS = 5000;

// Wrap every chat fetch with a timeout while still honoring caller-owned aborts,
// so selected-chat switches can cancel obsolete work without losing timeout safety.
async function fetchJson(url: string, options?: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const externalSignal = options?.signal;
  const abortFromExternalSignal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true });
  }

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json();
    return { res, data };
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
  }
}

function createEmptyEntry(): ChatMessageCacheEntry {
  return {
    messages: [],
    hasOlderMessages: true,
    latestAcknowledgedOutgoingMessageId: null,
    isInitialLoading: false,
    isRefreshing: false,
    isLoadingOlder: false,
    error: null,
    lastFetchedAt: null,
    lastAccessedAt: Date.now(),
  };
}

export function latestAcknowledgedOutgoingMessageId(messages: TelegramMessage[], previous: number | null = null): number | null {
  const latest = messages.reduce<number | null>((max, message) => {
    if (!message.isOutgoing || message.reactionCount <= 0) return max;
    return max === null || message.id > max ? message.id : max;
  }, null);
  if (latest === null) return previous;
  return previous === null ? latest : Math.max(previous, latest);
}

export function mergeTelegramMessages(current: TelegramMessage[], incoming: TelegramMessage[], mode: 'replace' | 'append' | 'prepend'): TelegramMessage[] {
  const source = mode === 'replace' ? incoming : mode === 'prepend' ? [...incoming, ...current] : [...current, ...incoming];
  const byId = new Map<number, TelegramMessage>();
  for (const message of source) byId.set(message.id, message);
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

// Selection changes should show fresh cached messages immediately instead of
// refetching on every A/B click; stale or empty caches still refresh right away.
export function shouldRefreshSelectedMessages(
  entry: Pick<ChatMessageCacheEntry, 'messages' | 'lastFetchedAt'> | null | undefined,
  now: number,
  staleMs = SELECTED_MESSAGE_REFRESH_STALE_MS,
): boolean {
  if (!entry?.messages.length || entry.lastFetchedAt === null) return true;
  return now - entry.lastFetchedAt >= staleMs;
}

function trimMessages(messages: TelegramMessage[]): TelegramMessage[] {
  if (messages.length <= MAX_MESSAGES_PER_CHAT) return messages;
  return messages.slice(messages.length - MAX_MESSAGES_PER_CHAT);
}

function updateEntry(
  cache: Record<string, ChatMessageCacheEntry>,
  chatId: string,
  updater: (entry: ChatMessageCacheEntry) => ChatMessageCacheEntry,
): Record<string, ChatMessageCacheEntry> {
  const current = cache[chatId] || createEmptyEntry();
  const next = { ...cache, [chatId]: updater(current) };
  const entries = Object.entries(next);
  if (entries.length <= MAX_CACHED_CHATS) return next;
  const [oldestChatId] = entries.reduce((oldest, candidate) => (
    candidate[1].lastAccessedAt < oldest[1].lastAccessedAt ? candidate : oldest
  ));
  delete next[oldestChatId];
  return next;
}

function requestErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.name === 'AbortError') return `${fallback} timed out`;
  return err instanceof Error ? err.message : fallback;
}

function shouldPollWhileVisible(policy: TelegramPollingPolicy): boolean {
  return policy.pollWhenHidden || !document.hidden;
}

async function fetchTelegramPollingPolicy(): Promise<TelegramPollingPolicy> {
  const { res, data } = await fetchJson('/api/telegram/status');
  if (!res.ok) throw new Error(data.error?.message || data.error || 'Failed to load Telegram status');
  return data.telegramPolicy || DEFAULT_TELEGRAM_POLLING_POLICY;
}

export function useTelegramChatInbox(): UseTelegramChatInboxResult {
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messageCache, setMessageCache] = useState<Record<string, ChatMessageCacheEntry>>({});
  const [loadingChats, setLoadingChats] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telegramPolicy, setTelegramPolicy] = useState<TelegramPollingPolicy>(DEFAULT_TELEGRAM_POLLING_POLICY);

  const chatsRef = useRef<TelegramChat[]>([]);
  const selectedChatIdRef = useRef<string | null>(null);
  const messageCacheRef = useRef<Record<string, ChatMessageCacheEntry>>({});
  const loadingChatsRef = useRef(false);
  const telegramPolicyRef = useRef<TelegramPollingPolicy>(DEFAULT_TELEGRAM_POLLING_POLICY);
  const messageInFlightRef = useRef<Record<string, boolean>>({});
  // Each message request gets a per-chat generation so late responses from
  // superseded requests cannot overwrite newer cache state.
  const messageRequestGenerationRef = useRef<Record<string, number>>({});
  // Only one selected-thread request should be active globally; switching chats
  // aborts the previous selected fetch instead of letting requests pile up.
  const selectedMessageRequestRef = useRef<{ chatId: string; generation: number; controller: AbortController } | null>(null);
  const olderInFlightRef = useRef<Record<string, boolean>>({});
  const chatListPollRef = useRef<NodeJS.Timeout | null>(null);
  const messagePollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { chatsRef.current = chats; }, [chats]);
  useEffect(() => { selectedChatIdRef.current = selectedChatId; }, [selectedChatId]);
  useEffect(() => { messageCacheRef.current = messageCache; }, [messageCache]);
  useEffect(() => { telegramPolicyRef.current = telegramPolicy; }, [telegramPolicy]);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) || null,
    [chats, selectedChatId],
  );
  const selectedCacheEntry = selectedChatId ? messageCache[selectedChatId] || null : null;
  const selectedMessages = selectedCacheEntry?.messages || [];
  const selectedChatTitle = selectedChat?.title || '';

  const markChatRead = useCallback((chatId: string, maxMessageId?: number) => {
    setChats((current) => current.map((chat) => (chat.id === chatId ? { ...chat, unreadCount: 0 } : chat)));
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), MARK_READ_TIMEOUT_MS);
    void fetch(`/api/telegram/chats/${encodeURIComponent(chatId)}/messages`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxMessageId }),
      signal: controller.signal,
    })
      .catch(() => {
        // Best-effort: Telegram unread state will be refreshed by the next dialog poll.
      })
      .finally(() => window.clearTimeout(timeout));
  }, []);

  const refreshChats = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    if (loadingChatsRef.current) return;
    loadingChatsRef.current = true;
    if (!background && chatsRef.current.length === 0) setLoadingChats(true);
    setError(null);
    try {
      const { res, data } = await fetchJson('/api/telegram/chats?limit=100');
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Failed to load Telegram chats');
      const nextChats: TelegramChat[] = data.chats || [];
      const currentSelected = selectedChatIdRef.current;
      setChats(nextChats.map((chat) => (chat.id === currentSelected ? { ...chat, unreadCount: 0 } : chat)));
      if (!currentSelected && nextChats.length) {
        const lastChatId = window.localStorage.getItem('mission-control.telegram.lastChatId');
        const preferredChat = nextChats.find((chat) => chat.id === lastChatId) || nextChats[0];
        setSelectedChatId(preferredChat.id);
      }
    } catch (err) {
      setError(requestErrorMessage(err, 'Telegram chat list request'));
    } finally {
      loadingChatsRef.current = false;
      setLoadingChats(false);
    }
  }, []);

  // Load the latest window for a chat. When called for the selected thread, this
  // also enforces abort/stale-response guards for rapid chat switching.
  const loadMessagesForChat = useCallback(async (chatId: string, background = false, options?: { selected?: boolean }) => {
    const selectedRequest = options?.selected ?? false;
    if (messageInFlightRef.current[chatId]) return;

    if (selectedRequest) {
      const activeSelectedRequest = selectedMessageRequestRef.current;
      if (activeSelectedRequest) {
        // A new selected-chat request makes the prior selected fetch obsolete;
        // abort it and release its in-flight flag so the new chat can proceed.
        activeSelectedRequest.controller.abort();
        messageInFlightRef.current[activeSelectedRequest.chatId] = false;
      }
    }

    messageInFlightRef.current[chatId] = true;
    const controller = new AbortController();
    const generation = (messageRequestGenerationRef.current[chatId] ?? 0) + 1;
    messageRequestGenerationRef.current[chatId] = generation;
    if (selectedRequest) selectedMessageRequestRef.current = { chatId, generation, controller };
    const isLatestRequest = () => messageRequestGenerationRef.current[chatId] === generation;

    const existing = messageCacheRef.current[chatId];
    const hasCachedMessages = Boolean(existing?.messages.length);
    const latestCachedMessageId = existing?.messages.at(-1)?.id ?? null;
    const afterMessageId = background ? (existing?.latestAcknowledgedOutgoingMessageId ?? latestCachedMessageId) : null;
    const shouldAppend = Boolean(background && afterMessageId);
    const query = new URLSearchParams({ limit: String(MESSAGE_BATCH_SIZE) });
    if (afterMessageId) query.set('after', String(afterMessageId));

    setMessageCache((cache) => updateEntry(cache, chatId, (entry) => ({
      ...entry,
      isInitialLoading: !background && entry.messages.length === 0,
      isRefreshing: background || (hasCachedMessages && !afterMessageId),
      error: null,
      lastAccessedAt: Date.now(),
    })));
    setError(null);

    try {
      const { res, data } = await fetchJson(`/api/telegram/chats/${encodeURIComponent(chatId)}/messages?${query.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Failed to load Telegram messages');
      const fetchedMessages: TelegramMessage[] = data.messages || [];
      if (!isLatestRequest()) return;
      setMessageCache((cache) => updateEntry(cache, chatId, (entry) => {
        const merged = trimMessages(mergeTelegramMessages(entry.messages, fetchedMessages, shouldAppend ? 'append' : 'replace'));
        return {
          ...entry,
          messages: merged,
          hasOlderMessages: shouldAppend ? entry.hasOlderMessages : fetchedMessages.length >= MESSAGE_BATCH_SIZE,
          latestAcknowledgedOutgoingMessageId: latestAcknowledgedOutgoingMessageId(merged, entry.latestAcknowledgedOutgoingMessageId),
          isInitialLoading: false,
          isRefreshing: false,
          error: null,
          lastFetchedAt: Date.now(),
          lastAccessedAt: Date.now(),
        };
      }));
      if (selectedChatIdRef.current === chatId) {
        const latestLoadedMessageId = fetchedMessages.at(-1)?.id ?? messageCacheRef.current[chatId]?.messages.at(-1)?.id;
        markChatRead(chatId, latestLoadedMessageId);
      }
    } catch (err) {
      if (!isLatestRequest()) return;
      if (controller.signal.aborted) {
        // Aborted selected fetches are expected during fast chat switching; clear
        // loading state quietly instead of showing a timeout/error to the user.
        setMessageCache((cache) => updateEntry(cache, chatId, (entry) => ({
          ...entry,
          isInitialLoading: false,
          isRefreshing: false,
          lastAccessedAt: Date.now(),
        })));
        return;
      }
      const message = requestErrorMessage(err, 'Telegram message request');
      setError(message);
      setMessageCache((cache) => updateEntry(cache, chatId, (entry) => ({
        ...entry,
        isInitialLoading: false,
        isRefreshing: false,
        error: message,
        hasOlderMessages: entry.messages.length ? entry.hasOlderMessages : false,
        lastAccessedAt: Date.now(),
      })));
    } finally {
      if (isLatestRequest()) messageInFlightRef.current[chatId] = false;
      const activeSelectedRequest = selectedMessageRequestRef.current;
      if (activeSelectedRequest?.chatId === chatId && activeSelectedRequest.generation === generation) {
        selectedMessageRequestRef.current = null;
      }
    }
  }, [markChatRead]);

  const refreshSelectedMessages = useCallback(async (options?: { background?: boolean }) => {
    const chatId = selectedChatIdRef.current;
    if (!chatId) return;
    await loadMessagesForChat(chatId, options?.background ?? false, { selected: true });
  }, [loadMessagesForChat]);

  useEffect(() => {
    void fetchTelegramPollingPolicy()
      .then(setTelegramPolicy)
      .catch(() => setTelegramPolicy(DEFAULT_TELEGRAM_POLLING_POLICY));
  }, []);

  useEffect(() => {
    void refreshChats();
    if (isTelegramPollIntervalEnabled(telegramPolicy, telegramPolicy.chatListPollMs)) {
      chatListPollRef.current = setInterval(() => {
        if (shouldPollWhileVisible(telegramPolicyRef.current)) void refreshChats({ background: true });
      }, telegramPolicy.chatListPollMs);
    }

    return () => {
      if (chatListPollRef.current) clearInterval(chatListPollRef.current);
    };
  }, [refreshChats, telegramPolicy]);

  useEffect(() => {
    if (messagePollRef.current) {
      clearInterval(messagePollRef.current);
      messagePollRef.current = null;
    }
    if (!selectedChatId) return;

    const selectedEntry = messageCacheRef.current[selectedChatId];
    const hasCachedMessages = Boolean(selectedEntry?.messages.length);
    if (shouldRefreshSelectedMessages(selectedEntry, Date.now())) {
      void loadMessagesForChat(selectedChatId, hasCachedMessages, { selected: true });
    }
    if (isTelegramPollIntervalEnabled(telegramPolicy, telegramPolicy.selectedChatPollMs)) {
      messagePollRef.current = setInterval(() => {
        if (shouldPollWhileVisible(telegramPolicyRef.current)) void loadMessagesForChat(selectedChatId, true, { selected: true });
      }, telegramPolicy.selectedChatPollMs);
    }

    return () => {
      if (messagePollRef.current) clearInterval(messagePollRef.current);
    };
  }, [loadMessagesForChat, selectedChatId, telegramPolicy]);

  const selectChat = useCallback((chat: TelegramChat) => {
    setSelectedChatId(chat.id);
    setMessageCache((cache) => updateEntry(cache, chat.id, (entry) => ({ ...entry, lastAccessedAt: Date.now() })));
    window.localStorage.setItem('mission-control.telegram.lastChatId', chat.id);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedChatId(null);
  }, []);

  const setChatScrollTop = useCallback((chatId: string, scrollTop: number) => {
    setMessageCache((cache) => updateEntry(cache, chatId, (entry) => ({ ...entry, scrollTop, lastAccessedAt: Date.now() })));
  }, []);

  const loadOlderMessages = useCallback(async () => {
    const chatId = selectedChatIdRef.current;
    if (!chatId || olderInFlightRef.current[chatId]) return;
    const currentMessages = messageCacheRef.current[chatId]?.messages || [];
    if (currentMessages.length === 0) return;

    olderInFlightRef.current[chatId] = true;
    const oldestMessageId = currentMessages[0].id;
    setMessageCache((cache) => updateEntry(cache, chatId, (entry) => ({ ...entry, isLoadingOlder: true, error: null, lastAccessedAt: Date.now() })));
    setError(null);
    try {
      const { res, data } = await fetchJson(`/api/telegram/chats/${encodeURIComponent(chatId)}/messages?limit=${MESSAGE_BATCH_SIZE}&before=${oldestMessageId}`);
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Failed to load older Telegram messages');
      const olderMessages: TelegramMessage[] = data.messages || [];
      setMessageCache((cache) => updateEntry(cache, chatId, (entry) => {
        const merged = trimMessages(mergeTelegramMessages(entry.messages, olderMessages, 'prepend'));
        return {
          ...entry,
          messages: merged,
          hasOlderMessages: olderMessages.length >= MESSAGE_BATCH_SIZE,
          latestAcknowledgedOutgoingMessageId: latestAcknowledgedOutgoingMessageId(merged, entry.latestAcknowledgedOutgoingMessageId),
          isLoadingOlder: false,
          error: null,
          lastFetchedAt: Date.now(),
          lastAccessedAt: Date.now(),
        };
      }));
    } catch (err) {
      const message = requestErrorMessage(err, 'Failed to load older Telegram messages');
      setError(message);
      setMessageCache((cache) => updateEntry(cache, chatId, (entry) => ({ ...entry, isLoadingOlder: false, error: message, lastAccessedAt: Date.now() })));
    } finally {
      olderInFlightRef.current[chatId] = false;
    }
  }, []);

  const sendMessage = useCallback(async (text: string, replyTo?: TelegramMessage | null): Promise<SendMessageResult> => {
    const chatId = selectedChatIdRef.current;
    const chunks = splitTelegramMessageText(text.trim());
    if (!chatId || chunks.length === 0 || sending) return { ok: false, unsentText: text, sentAnyChunks: false, error: 'No Telegram chat selected.' };

    setSending(true);
    setError(null);
    let failedChunkIndex: number | null = null;
    let sentAnyChunks = false;
    const sentMessages: TelegramMessage[] = [];
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        failedChunkIndex = index;
        const { res, data } = await fetchJson(`/api/telegram/chats/${encodeURIComponent(chatId)}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: chunk, replyToMessageId: index === 0 ? replyTo?.id : undefined }),
        });
        if (!res.ok) throw new Error(data.error?.message || data.error || 'Failed to send Telegram message');
        sentAnyChunks = true;
        const sentMessage: TelegramMessage = data.message;
        sentMessages.push(sentMessage);
        setMessageCache((cache) => updateEntry(cache, chatId, (entry) => {
          const merged = trimMessages(mergeTelegramMessages(entry.messages, [sentMessage], 'append'));
          return {
            ...entry,
            messages: merged,
            latestAcknowledgedOutgoingMessageId: latestAcknowledgedOutgoingMessageId(merged, entry.latestAcknowledgedOutgoingMessageId),
            error: null,
            lastFetchedAt: Date.now(),
            lastAccessedAt: Date.now(),
          };
        }));
      }
      await refreshChats();
      return { ok: true, sentMessages };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send Telegram message';
      setError(message);
      if (sentAnyChunks) await refreshChats();
      const unsentText = failedChunkIndex === null ? text : chunks.slice(failedChunkIndex).join('\n');
      return { ok: false, unsentText, sentAnyChunks, error: message };
    } finally {
      setSending(false);
    }
  }, [refreshChats, sending]);

  return {
    chats,
    selectedChat,
    selectedChatId,
    selectedChatTitle,
    selectedMessages,
    selectedCacheEntry,
    loadingChats,
    loadingMessages: Boolean(selectedChatId && !selectedCacheEntry) || Boolean(selectedCacheEntry?.isInitialLoading),
    loadingOlder: Boolean(selectedCacheEntry?.isLoadingOlder),
    hasOlderMessages: selectedCacheEntry?.hasOlderMessages ?? true,
    sending,
    error: error || selectedCacheEntry?.error || null,
    selectChat,
    clearSelection,
    loadOlderMessages,
    sendMessage,
    setChatScrollTop,
    refreshChats,
    refreshSelectedMessages,
  };
}
