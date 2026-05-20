'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TelegramMessage } from './useTelegramChatInbox';

export const TELEGRAM_AGENT_READ_MARKERS_STORAGE_KEY = 'mission-control.telegram.agentReadMarkers.v1';
export const MAX_TELEGRAM_AGENT_READ_MARKERS_PER_CHAT = 100;

export type TelegramAgentReadMarkers = Record<string, number[]>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidMessageId(value: unknown): value is number {
  return Number.isInteger(value) && Number.isSafeInteger(value);
}

export function parseTelegramAgentReadMarkers(raw: string | null): TelegramAgentReadMarkers {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return {};

    const markers: TelegramAgentReadMarkers = {};
    for (const [chatId, messageIds] of Object.entries(parsed)) {
      if (typeof chatId !== 'string' || !Array.isArray(messageIds)) return {};
      if (!messageIds.every(isValidMessageId)) return {};
      markers[chatId] = messageIds.slice(-MAX_TELEGRAM_AGENT_READ_MARKERS_PER_CHAT);
    }
    return markers;
  } catch {
    return {};
  }
}

export function markTelegramAgentMessagesRead(
  markers: TelegramAgentReadMarkers,
  chatId: string,
  messageIds: number[],
): TelegramAgentReadMarkers {
  if (messageIds.length === 0) return markers;

  const current = markers[chatId] || [];
  const uniqueMessageIds = Array.from(new Set(messageIds));
  const hasNewMarker = uniqueMessageIds.some((messageId) => !current.includes(messageId));
  if (!hasNewMarker) return markers;

  const nextChatMarkers = current
    .filter((id) => !uniqueMessageIds.includes(id))
    .concat(uniqueMessageIds)
    .slice(-MAX_TELEGRAM_AGENT_READ_MARKERS_PER_CHAT);

  return { ...markers, [chatId]: nextChatMarkers };
}

export function markTelegramAgentMessageRead(
  markers: TelegramAgentReadMarkers,
  chatId: string,
  messageId: number,
): TelegramAgentReadMarkers {
  const current = markers[chatId] || [];
  const nextChatMarkers = current
    .filter((id) => id !== messageId)
    .concat(messageId)
    .slice(-MAX_TELEGRAM_AGENT_READ_MARKERS_PER_CHAT);

  return { ...markers, [chatId]: nextChatMarkers };
}

export function unmarkTelegramAgentMessageRead(
  markers: TelegramAgentReadMarkers,
  chatId: string,
  messageId: number,
): TelegramAgentReadMarkers {
  const nextChatMarkers = (markers[chatId] || []).filter((id) => id !== messageId);
  return { ...markers, [chatId]: nextChatMarkers };
}

export function isTelegramAgentMessageMarkedRead(
  markers: TelegramAgentReadMarkers,
  chatId: string,
  messageId: number,
): boolean {
  return Boolean(markers[chatId]?.includes(messageId));
}

export function toggleTelegramAgentMessageRead(
  markers: TelegramAgentReadMarkers,
  chatId: string,
  messageId: number,
): TelegramAgentReadMarkers {
  return isTelegramAgentMessageMarkedRead(markers, chatId, messageId)
    ? unmarkTelegramAgentMessageRead(markers, chatId, messageId)
    : markTelegramAgentMessageRead(markers, chatId, messageId);
}

export function replyParentReadMarkerIds(messages: TelegramMessage[]): number[] {
  const incomingMessageIds = new Set(messages.filter((message) => !message.isOutgoing).map((message) => message.id));
  const parentIds = messages
    .filter((message) => message.isOutgoing && message.replyToMessageId !== null && incomingMessageIds.has(message.replyToMessageId))
    .map((message) => message.replyToMessageId as number);

  return Array.from(new Set(parentIds));
}

export function useTelegramAgentReadMarkers() {
  const [markers, setMarkers] = useState<TelegramAgentReadMarkers>({});

  useEffect(() => {
    const parsed = parseTelegramAgentReadMarkers(window.localStorage.getItem(TELEGRAM_AGENT_READ_MARKERS_STORAGE_KEY));
    window.localStorage.setItem(TELEGRAM_AGENT_READ_MARKERS_STORAGE_KEY, JSON.stringify(parsed));
    setMarkers(parsed);
  }, []);

  const updateMarkers = useCallback((updater: (current: TelegramAgentReadMarkers) => TelegramAgentReadMarkers) => {
    setMarkers((current) => {
      const next = updater(current);
      window.localStorage.setItem(TELEGRAM_AGENT_READ_MARKERS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isMarkedRead = useCallback((chatId: string, messageId: number) => (
    isTelegramAgentMessageMarkedRead(markers, chatId, messageId)
  ), [markers]);

  const markReadMarker = useCallback((chatId: string, messageId: number) => {
    updateMarkers((current) => markTelegramAgentMessageRead(current, chatId, messageId));
  }, [updateMarkers]);

  const markReplyParentsRead = useCallback((chatId: string, messages: TelegramMessage[]) => {
    const parentIds = replyParentReadMarkerIds(messages);
    updateMarkers((current) => markTelegramAgentMessagesRead(current, chatId, parentIds));
  }, [updateMarkers]);

  const toggleReadMarker = useCallback((chatId: string, messageId: number) => {
    updateMarkers((current) => toggleTelegramAgentMessageRead(current, chatId, messageId));
  }, [updateMarkers]);

  return { isMarkedRead, markReadMarker, markReplyParentsRead, toggleReadMarker };
}
