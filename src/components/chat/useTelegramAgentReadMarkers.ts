'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TelegramMessage } from './useTelegramChatInbox';

export const TELEGRAM_AGENT_MESSAGE_MARKERS_STORAGE_KEY = 'mission-control.telegram.agentMessageMarkers.v2';
export const TELEGRAM_AGENT_READ_MARKERS_STORAGE_KEY = 'mission-control.telegram.agentReadMarkers.v1';
export const MAX_TELEGRAM_AGENT_MARKERS_PER_CHAT = 100;
export const MAX_TELEGRAM_AGENT_READ_MARKERS_PER_CHAT = MAX_TELEGRAM_AGENT_MARKERS_PER_CHAT;

export type TelegramAgentReadMarkers = Record<string, number[]>;

export type TelegramAgentMessageMarkers = {
  read: Record<string, number[]>;
  starred: Record<string, number[]>;
};

export type TelegramAgentMarkerState = {
  isRead: boolean;
  isStarred: boolean;
  displayState: 'none' | 'read' | 'starred';
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidMessageId(value: unknown): value is number {
  return Number.isInteger(value) && Number.isSafeInteger(value);
}

function emptyMessageMarkers(): TelegramAgentMessageMarkers {
  return { read: {}, starred: {} };
}

function parseMarkerSection(value: unknown): Record<string, number[]> | null {
  if (value === undefined) return {};
  if (!isPlainObject(value)) return null;

  const markers: Record<string, number[]> = {};
  for (const [chatId, messageIds] of Object.entries(value)) {
    if (typeof chatId !== 'string' || !Array.isArray(messageIds)) return null;
    if (!messageIds.every(isValidMessageId)) return null;
    markers[chatId] = messageIds.slice(-MAX_TELEGRAM_AGENT_MARKERS_PER_CHAT);
  }
  return markers;
}

export function parseTelegramAgentReadMarkers(raw: string | null): TelegramAgentReadMarkers {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    const markers = parseMarkerSection(parsed);
    return markers ?? {};
  } catch {
    return {};
  }
}

export function parseTelegramAgentMessageMarkers(
  rawV2: string | null,
  rawV1Read: string | null = null,
): TelegramAgentMessageMarkers {
  if (!rawV2) {
    return { read: parseTelegramAgentReadMarkers(rawV1Read), starred: {} };
  }

  try {
    const parsed: unknown = JSON.parse(rawV2);
    if (!isPlainObject(parsed)) return emptyMessageMarkers();

    const read = parseMarkerSection(parsed.read);
    const starred = parseMarkerSection(parsed.starred);
    if (!read || !starred) return emptyMessageMarkers();

    return { read, starred };
  } catch {
    return emptyMessageMarkers();
  }
}

function addMessageIdsToSection(
  section: Record<string, number[]>,
  chatId: string,
  messageIds: number[],
): Record<string, number[]> {
  if (messageIds.length === 0) return section;

  const current = section[chatId] || [];
  const uniqueMessageIds = Array.from(new Set(messageIds));
  const hasNewOrder = uniqueMessageIds.some((messageId) => !current.includes(messageId) || current.at(-1) !== messageId);
  if (!hasNewOrder) return section;

  const nextChatMarkers = current
    .filter((id) => !uniqueMessageIds.includes(id))
    .concat(uniqueMessageIds)
    .slice(-MAX_TELEGRAM_AGENT_MARKERS_PER_CHAT);

  return { ...section, [chatId]: nextChatMarkers };
}

function removeMessageIdFromSection(
  section: Record<string, number[]>,
  chatId: string,
  messageId: number,
): Record<string, number[]> {
  const current = section[chatId] || [];
  if (!current.includes(messageId)) return section;
  return { ...section, [chatId]: current.filter((id) => id !== messageId) };
}

export function markTelegramAgentMessagesRead(
  markers: TelegramAgentMessageMarkers,
  chatId: string,
  messageIds: number[],
): TelegramAgentMessageMarkers {
  const read = addMessageIdsToSection(markers.read, chatId, messageIds);
  if (read === markers.read) return markers;
  return { ...markers, read };
}

export function markTelegramAgentMessageRead(
  markers: TelegramAgentMessageMarkers,
  chatId: string,
  messageId: number,
): TelegramAgentMessageMarkers {
  return markTelegramAgentMessagesRead(markers, chatId, [messageId]);
}

export function markTelegramAgentMessageStarred(
  markers: TelegramAgentMessageMarkers,
  chatId: string,
  messageId: number,
): TelegramAgentMessageMarkers {
  const starred = addMessageIdsToSection(markers.starred, chatId, [messageId]);
  if (starred === markers.starred) return markers;
  return { ...markers, starred };
}

export function markTelegramAgentMessageReadAndStarred(
  markers: TelegramAgentMessageMarkers,
  chatId: string,
  messageId: number,
): TelegramAgentMessageMarkers {
  return markTelegramAgentMessageStarred(
    markTelegramAgentMessageRead(markers, chatId, messageId),
    chatId,
    messageId,
  );
}

export function unmarkTelegramAgentMessageRead(
  markers: TelegramAgentMessageMarkers,
  chatId: string,
  messageId: number,
): TelegramAgentMessageMarkers {
  const read = removeMessageIdFromSection(markers.read, chatId, messageId);
  if (read === markers.read) return markers;
  return { ...markers, read };
}

export function clearTelegramAgentMessageMarkers(
  markers: TelegramAgentMessageMarkers,
  chatId: string,
  messageId: number,
): TelegramAgentMessageMarkers {
  const read = removeMessageIdFromSection(markers.read, chatId, messageId);
  const starred = removeMessageIdFromSection(markers.starred, chatId, messageId);
  if (read === markers.read && starred === markers.starred) return markers;
  return { read, starred };
}

export function isTelegramAgentMessageRead(
  markers: TelegramAgentMessageMarkers,
  chatId: string,
  messageId: number,
): boolean {
  return Boolean(markers.read[chatId]?.includes(messageId));
}

export function isTelegramAgentMessageMarkedRead(
  markers: TelegramAgentMessageMarkers,
  chatId: string,
  messageId: number,
): boolean {
  return isTelegramAgentMessageRead(markers, chatId, messageId);
}

export function isTelegramAgentMessageStarred(
  markers: TelegramAgentMessageMarkers,
  chatId: string,
  messageId: number,
): boolean {
  return Boolean(markers.starred[chatId]?.includes(messageId));
}

export function getTelegramAgentMessageMarkerState(
  markers: TelegramAgentMessageMarkers,
  chatId: string,
  messageId: number,
): TelegramAgentMarkerState {
  const isRead = isTelegramAgentMessageRead(markers, chatId, messageId);
  const isStarred = isTelegramAgentMessageStarred(markers, chatId, messageId);

  return {
    isRead,
    isStarred,
    displayState: isStarred ? 'starred' : isRead ? 'read' : 'none',
  };
}

export function cycleTelegramAgentMessageMarker(
  markers: TelegramAgentMessageMarkers,
  chatId: string,
  messageId: number,
): TelegramAgentMessageMarkers {
  const { isRead, isStarred } = getTelegramAgentMessageMarkerState(markers, chatId, messageId);

  if (isStarred) return clearTelegramAgentMessageMarkers(markers, chatId, messageId);
  if (isRead) return markTelegramAgentMessageStarred(markers, chatId, messageId);
  return markTelegramAgentMessageRead(markers, chatId, messageId);
}

export function toggleTelegramAgentMessageRead(
  markers: TelegramAgentMessageMarkers,
  chatId: string,
  messageId: number,
): TelegramAgentMessageMarkers {
  return cycleTelegramAgentMessageMarker(markers, chatId, messageId);
}

export function replyParentReadMarkerIds(messages: TelegramMessage[]): number[] {
  const incomingMessageIds = new Set(messages.filter((message) => !message.isOutgoing).map((message) => message.id));
  const parentIds = messages
    .filter((message) => message.isOutgoing && message.replyToMessageId !== null && incomingMessageIds.has(message.replyToMessageId))
    .map((message) => message.replyToMessageId as number);

  return Array.from(new Set(parentIds));
}

export function useTelegramAgentReadMarkers() {
  const [markers, setMarkers] = useState<TelegramAgentMessageMarkers>(emptyMessageMarkers());

  useEffect(() => {
    const parsed = parseTelegramAgentMessageMarkers(
      window.localStorage.getItem(TELEGRAM_AGENT_MESSAGE_MARKERS_STORAGE_KEY),
      window.localStorage.getItem(TELEGRAM_AGENT_READ_MARKERS_STORAGE_KEY),
    );
    window.localStorage.setItem(TELEGRAM_AGENT_MESSAGE_MARKERS_STORAGE_KEY, JSON.stringify(parsed));
    setMarkers(parsed);
  }, []);

  const updateMarkers = useCallback((updater: (current: TelegramAgentMessageMarkers) => TelegramAgentMessageMarkers) => {
    setMarkers((current) => {
      const next = updater(current);
      window.localStorage.setItem(TELEGRAM_AGENT_MESSAGE_MARKERS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const getMarkerState = useCallback((chatId: string, messageId: number) => (
    getTelegramAgentMessageMarkerState(markers, chatId, messageId)
  ), [markers]);

  const isMarkedRead = useCallback((chatId: string, messageId: number) => (
    isTelegramAgentMessageRead(markers, chatId, messageId)
  ), [markers]);

  const isStarred = useCallback((chatId: string, messageId: number) => (
    isTelegramAgentMessageStarred(markers, chatId, messageId)
  ), [markers]);

  const markReadMarker = useCallback((chatId: string, messageId: number) => {
    updateMarkers((current) => markTelegramAgentMessageRead(current, chatId, messageId));
  }, [updateMarkers]);

  const markReadAndStarredMarker = useCallback((chatId: string, messageId: number) => {
    updateMarkers((current) => markTelegramAgentMessageReadAndStarred(current, chatId, messageId));
  }, [updateMarkers]);

  const markReplyParentsRead = useCallback((chatId: string, messages: TelegramMessage[]) => {
    const parentIds = replyParentReadMarkerIds(messages);
    updateMarkers((current) => markTelegramAgentMessagesRead(current, chatId, parentIds));
  }, [updateMarkers]);

  const cycleMarker = useCallback((chatId: string, messageId: number) => {
    updateMarkers((current) => cycleTelegramAgentMessageMarker(current, chatId, messageId));
  }, [updateMarkers]);

  const clearMarkers = useCallback((chatId: string, messageId: number) => {
    updateMarkers((current) => clearTelegramAgentMessageMarkers(current, chatId, messageId));
  }, [updateMarkers]);

  return {
    getMarkerState,
    isMarkedRead,
    isStarred,
    markReadMarker,
    markReadAndStarredMarker,
    markReplyParentsRead,
    cycleMarker,
    clearMarkers,
    toggleReadMarker: cycleMarker,
  };
}
