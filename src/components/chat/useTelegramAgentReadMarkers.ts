'use client';

import { useCallback, useEffect, useState } from 'react';

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

  const toggleReadMarker = useCallback((chatId: string, messageId: number) => {
    updateMarkers((current) => toggleTelegramAgentMessageRead(current, chatId, messageId));
  }, [updateMarkers]);

  return { isMarkedRead, toggleReadMarker };
}
