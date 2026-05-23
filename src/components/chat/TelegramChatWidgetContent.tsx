'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type TouchEvent, type WheelEvent } from 'react';
import { ChevronLeft, Loader } from 'lucide-react';
import { TELEGRAM_TEXT_MESSAGE_LIMIT, splitTelegramMessageText } from '@/lib/telegram/message-chunks';
import { useTelegramChatInbox, type TelegramMessage } from './useTelegramChatInbox';
import { getTelegramChatEmoji, isTelegramBridgeStatusText, visibleTelegramMessages } from './telegramChatDisplay';
import { useTelegramAgentReadMarkers } from './useTelegramAgentReadMarkers';
import { playTelegramSentSound, primeTelegramSentSound } from '@/lib/audio/telegramSentSound';
import { canStartTelegramSend, recoverFailedTelegramDraft, shouldSendTelegramComposerFromKeyDown, telegramSendButtonClassName } from './telegramComposerSendState';
import { focusTelegramComposerAfterReply } from './telegramComposerFocus';
import { useTelegramReplyContext } from './useTelegramReplyContext';
import { TelegramMessageBubble, TelegramReplyContextModal } from './TelegramReplyContextViews';
import type { TelegramReplyContextMessage } from './telegramReplyContext';
import { filterTelegramMessagesForView, type TelegramMessageViewFilter } from './telegramMessageViews';
import { groupTelegramChatsByPriority, shouldRenderTelegramChatPrioritySeparator } from './telegramChatPriorityGroups';
import { getActiveReplyTargetId, shouldShowReplyTargetMarker } from './telegramReplyTargetMarker';
import {
  appendedActionableMessageCount,
  classifyMessageListChange,
  getScrollBottom,
  isUserScrollingAway,
  isWithinBottomLockThreshold,
  isWithinLooseNearBottomThreshold,
  restoredScrollTopForHeightDelta,
  scrollTopForCenteredElement,
  scrollTopForPreservedBottom,
  shouldRestoreOlderMessageAnchor,
} from './telegramScrollAnchoring';

interface TelegramChatWidgetContentProps {
  isExpanded: boolean;
  activeMessageFilter: TelegramMessageViewFilter;
  onMessageFilterChange(filter: TelegramMessageViewFilter): void;
}

const CHAT_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';

type ScrollSnapshot = {
  scrollTop: number;
  scrollHeight: number;
};

type ManualReplyJumpGuard = {
  chatId: string;
  messageId: number;
  targetScrollTop: number;
  startedAt: number;
};

const MANUAL_REPLY_JUMP_TARGET_THRESHOLD_PX = 8;
const MANUAL_REPLY_JUMP_MAX_MS = 1000;
const MESSAGE_HIGHLIGHT_DURATION_MS = 2400;

function getScrollSnapshot(el: HTMLDivElement): ScrollSnapshot {
  return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight };
}

function isJumpToLatestActionableMessage(message: TelegramMessage): boolean {
  return !isTelegramBridgeStatusText(message.text);
}

export function TelegramChatWidgetContent({ isExpanded, activeMessageFilter, onMessageFilterChange }: TelegramChatWidgetContentProps) {
  const {
    chats,
    selectedChat,
    selectedMessages: messages,
    selectedCacheEntry,
    loadingChats,
    loadingMessages,
    loadingOlder,
    hasOlderMessages,
    sending,
    error,
    selectChat,
    clearSelection,
    loadOlderMessages,
    sendMessage,
    setChatScrollTop,
  } = useTelegramChatInbox();
  const [composerText, setComposerText] = useState('');
  const [replyingTo, setReplyingTo] = useState<TelegramMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const [pendingThreadContextJumpId, setPendingThreadContextJumpId] = useState<number | null>(null);
  const [threadContextJumpError, setThreadContextJumpError] = useState<string | null>(null);
  const { getMarkerState, markReadMarker, markReadAndStarredMarker, markReplyParentsRead, cycleMarker } = useTelegramAgentReadMarkers();
  const replyContext = useTelegramReplyContext({ chatId: selectedChat?.id || null, messages });
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(true);
  const bottomLockRef = useRef(true);
  const isNearBottomRef = useRef(true);
  const lastKnownScrollTopRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const scrollStateRef = useRef<{ chatId: string | null; messageIds: number[] }>({ chatId: null, messageIds: [] });
  const preRenderScrollSnapshotRef = useRef<ScrollSnapshot | null>(null);
  const loadOlderAnchorPendingRef = useRef<{ chatId: string; scrollBottom: number } | null>(null);
  const manualReplyJumpGuardRef = useRef<ManualReplyJumpGuard | null>(null);
  const manualReplyJumpFrameRef = useRef<number | null>(null);
  const manualReplyJumpTimeoutRef = useRef<number | null>(null);
  const [unseenNewMessageCount, setUnseenNewMessageCount] = useState(0);
  const previousChatIdRef = useRef<string | null>(null);
  const trimmedComposerText = composerText.trim();
  const composerChunks = splitTelegramMessageText(trimmedComposerText);
  const composerChunkCount = composerChunks.length;
  const activeReplyTargetId = getActiveReplyTargetId(replyingTo, replyContext.threadReplyTarget);
  const visibleMessages = useMemo(() => visibleTelegramMessages(messages), [messages]);
  const renderedMessages = useMemo(() => {
    if (!selectedChat) return visibleMessages;
    // Keep the floating widget's filters aligned with the full inbox: they are
    // local triage views over already loaded messages, not Telegram read-state
    // mutations or background history queries.
    return filterTelegramMessagesForView(visibleMessages, activeMessageFilter, (messageId) => getMarkerState(selectedChat.id, messageId));
  }, [activeMessageFilter, getMarkerState, selectedChat, visibleMessages]);
  const chatPriorityGroups = useMemo(() => groupTelegramChatsByPriority(chats), [chats]);
  const showChatPrioritySeparator = shouldRenderTelegramChatPrioritySeparator(chatPriorityGroups);

  function cancelManualReplyJumpChecks() {
    if (manualReplyJumpFrameRef.current !== null) {
      window.cancelAnimationFrame(manualReplyJumpFrameRef.current);
      manualReplyJumpFrameRef.current = null;
    }
    if (manualReplyJumpTimeoutRef.current !== null) {
      window.clearTimeout(manualReplyJumpTimeoutRef.current);
      manualReplyJumpTimeoutRef.current = null;
    }
  }

  function clearManualReplyJumpGuard() {
    manualReplyJumpGuardRef.current = null;
    cancelManualReplyJumpChecks();
  }

  function isManualReplyJumpComplete(guard: ManualReplyJumpGuard, el: HTMLDivElement) {
    return (
      Math.abs(el.scrollTop - guard.targetScrollTop) <= MANUAL_REPLY_JUMP_TARGET_THRESHOLD_PX ||
      window.performance.now() - guard.startedAt >= MANUAL_REPLY_JUMP_MAX_MS
    );
  }

  function trackManualReplyJump(scrollEl: HTMLDivElement, guard: ManualReplyJumpGuard) {
    cancelManualReplyJumpChecks();
    manualReplyJumpGuardRef.current = guard;

    const check = () => {
      const currentGuard = manualReplyJumpGuardRef.current;
      if (
        !currentGuard ||
        currentGuard.chatId !== guard.chatId ||
        currentGuard.messageId !== guard.messageId
      ) {
        manualReplyJumpFrameRef.current = null;
        return;
      }
      if (isManualReplyJumpComplete(currentGuard, scrollEl)) {
        clearManualReplyJumpGuard();
        return;
      }
      manualReplyJumpFrameRef.current = window.requestAnimationFrame(check);
    };

    manualReplyJumpFrameRef.current = window.requestAnimationFrame(check);
    manualReplyJumpTimeoutRef.current = window.setTimeout(() => {
      const currentGuard = manualReplyJumpGuardRef.current;
      if (
        currentGuard?.chatId === guard.chatId &&
        currentGuard.messageId === guard.messageId
      ) {
        clearManualReplyJumpGuard();
      }
    }, MANUAL_REPLY_JUMP_MAX_MS);
  }

  useEffect(() => {
    return () => clearManualReplyJumpGuard();
  }, []);

  useEffect(() => {
    const nextChatId = selectedChat?.id || null;
    const previousChatId = previousChatIdRef.current;
    if (nextChatId && previousChatId !== nextChatId) {
      shouldScrollToBottomRef.current = !selectedCacheEntry?.messages.length;
      bottomLockRef.current = !selectedCacheEntry?.messages.length;
      isNearBottomRef.current = true;
      lastKnownScrollTopRef.current = selectedCacheEntry?.scrollTop || 0;
      setUnseenNewMessageCount(0);
      setReplyingTo(null);
      onMessageFilterChange('all');
      replyContext.closeThread();
    }
    previousChatIdRef.current = nextChatId;
  }, [onMessageFilterChange, replyContext, selectedCacheEntry?.messages.length, selectedChat?.id]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const currentMessageIds = renderedMessages.map((message) => message.id);
    const previousScrollState = scrollStateRef.current;

    if (!el || !selectedChat) {
      scrollStateRef.current = { chatId: selectedChat?.id || null, messageIds: currentMessageIds };
      return;
    }

    const chatChanged = previousScrollState.chatId !== selectedChat.id;
    const messageListChange = chatChanged
      ? 'replace'
      : classifyMessageListChange(previousScrollState.messageIds, currentMessageIds);
    const beforeSnapshot = preRenderScrollSnapshotRef.current;
    const wasBottomLocked = bottomLockRef.current;

    const manualReplyJumpGuard = manualReplyJumpGuardRef.current;
    const manualReplyJumpInProgress =
      manualReplyJumpGuard?.chatId === selectedChat.id &&
      !isManualReplyJumpComplete(manualReplyJumpGuard, el);

    if (chatChanged) {
      if (selectedCacheEntry?.scrollTop !== undefined && currentMessageIds.length > 0) {
        el.scrollTop = selectedCacheEntry.scrollTop;
        bottomLockRef.current = isWithinBottomLockThreshold(getScrollBottom(el.scrollHeight, el.scrollTop, el.clientHeight));
      } else {
        el.scrollTop = el.scrollHeight;
        bottomLockRef.current = true;
      }
      isNearBottomRef.current = isWithinLooseNearBottomThreshold(getScrollBottom(el.scrollHeight, el.scrollTop, el.clientHeight));
      setUnseenNewMessageCount(0);
    } else if (manualReplyJumpInProgress) {
      shouldScrollToBottomRef.current = false;
      bottomLockRef.current = false;
      isNearBottomRef.current = false;
    } else if (
      shouldRestoreOlderMessageAnchor(
        messageListChange,
        loadOlderAnchorPendingRef.current?.chatId === selectedChat.id,
      ) && loadOlderAnchorPendingRef.current
    ) {
      el.scrollTop = scrollTopForPreservedBottom(
        el.scrollHeight,
        loadOlderAnchorPendingRef.current.scrollBottom,
        el.clientHeight,
      );
      bottomLockRef.current = false;
      isNearBottomRef.current = isWithinLooseNearBottomThreshold(getScrollBottom(el.scrollHeight, el.scrollTop, el.clientHeight));
      const newCount = appendedActionableMessageCount(
        previousScrollState.messageIds,
        renderedMessages,
        isJumpToLatestActionableMessage,
      );
      if (newCount > 0) {
        setUnseenNewMessageCount((count) => count + newCount);
      }
    } else if (shouldScrollToBottomRef.current || wasBottomLocked) {
      el.scrollTop = el.scrollHeight;
      bottomLockRef.current = true;
      isNearBottomRef.current = true;
      setUnseenNewMessageCount(0);
    } else if (
      (messageListChange === 'append' ||
        messageListChange === 'prepend' ||
        messageListChange === 'mixed') &&
      beforeSnapshot
    ) {
      el.scrollTop = beforeSnapshot.scrollTop;
      const newCount = appendedActionableMessageCount(
        previousScrollState.messageIds,
        renderedMessages,
        isJumpToLatestActionableMessage,
      );
      if (newCount > 0) {
        setUnseenNewMessageCount((count) => count + newCount);
      }
    } else if (messageListChange === 'same' && beforeSnapshot) {
      el.scrollTop = restoredScrollTopForHeightDelta(
        beforeSnapshot.scrollTop,
        beforeSnapshot.scrollHeight,
        el.scrollHeight,
      );
    } else if (selectedCacheEntry?.scrollTop !== undefined) {
      el.scrollTop = selectedCacheEntry.scrollTop;
    }

    shouldScrollToBottomRef.current = false;
    preRenderScrollSnapshotRef.current = null;
    loadOlderAnchorPendingRef.current = null;
    scrollStateRef.current = { chatId: selectedChat.id, messageIds: currentMessageIds };
    lastKnownScrollTopRef.current = el.scrollTop;
    if (selectedCacheEntry?.scrollTop !== el.scrollTop) {
      setChatScrollTop(selectedChat.id, el.scrollTop);
    }

    return () => {
      preRenderScrollSnapshotRef.current = getScrollSnapshot(el);
    };
  }, [renderedMessages, selectedCacheEntry?.scrollTop, selectedChat, setChatScrollTop]);

  useEffect(() => {
    if (highlightedMessageId === null) return;
    const timeout = window.setTimeout(() => setHighlightedMessageId(null), MESSAGE_HIGHLIGHT_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [highlightedMessageId]);

  useEffect(() => {
    if (!selectedChat) return;
    markReplyParentsRead(selectedChat.id, messages);
  }, [markReplyParentsRead, messages, selectedChat]);

  const handleThreadScroll = () => {
    const el = scrollRef.current;
    if (!el || !selectedChat) return;
    if (isUserScrollingAway(lastKnownScrollTopRef.current, el.scrollTop)) {
      bottomLockRef.current = false;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = isWithinLooseNearBottomThreshold(distanceFromBottom);
    if (isWithinBottomLockThreshold(distanceFromBottom)) {
      bottomLockRef.current = true;
      setUnseenNewMessageCount(0);
    }
    lastKnownScrollTopRef.current = el.scrollTop;
    setChatScrollTop(selectedChat.id, el.scrollTop);
  };

  const disengageBottomLock = () => {
    bottomLockRef.current = false;
    shouldScrollToBottomRef.current = false;
  };

  const handleThreadWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) disengageBottomLock();
  };

  const handleThreadTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleThreadTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const previousY = touchStartYRef.current;
    const nextY = event.touches[0]?.clientY ?? null;
    if (previousY !== null && nextY !== null && nextY > previousY + 1) {
      disengageBottomLock();
    }
    touchStartYRef.current = nextY;
  };

  const handleLoadOlderMessages = async () => {
    const el = scrollRef.current;
    if (el && selectedChat) {
      loadOlderAnchorPendingRef.current = {
        chatId: selectedChat.id,
        scrollBottom: getScrollBottom(el.scrollHeight, el.scrollTop, el.clientHeight),
      };
    }
    shouldScrollToBottomRef.current = false;
    bottomLockRef.current = false;
    await loadOlderMessages();
  };

  const jumpToLatestMessages = () => {
    const el = scrollRef.current;
    shouldScrollToBottomRef.current = true;
    bottomLockRef.current = true;
    isNearBottomRef.current = true;
    setUnseenNewMessageCount(0);
    if (el && selectedChat) {
      el.scrollTop = el.scrollHeight;
      setChatScrollTop(selectedChat.id, el.scrollTop);
    }
  };

  const jumpToMessage = (messageId: number) => {
    const scrollEl = scrollRef.current;
    const selector = `[data-telegram-message-id="${messageId}"]`;
    const targetEl = scrollEl?.querySelector<HTMLElement>(selector);
    if (!scrollEl || !targetEl || !selectedChat) return false;

    shouldScrollToBottomRef.current = false;
    bottomLockRef.current = false;
    const scrollRect = scrollEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const targetScrollTop = scrollTopForCenteredElement(
      scrollEl.scrollTop,
      scrollRect.top,
      scrollEl.clientHeight,
      targetRect.top,
      targetRect.height,
    );
    const normalizedTargetScrollTop = Math.max(0, targetScrollTop);
    trackManualReplyJump(scrollEl, {
      chatId: selectedChat.id,
      messageId,
      targetScrollTop: normalizedTargetScrollTop,
      startedAt: window.performance.now(),
    });
    scrollEl.scrollTo({ top: normalizedTargetScrollTop, behavior: 'smooth' });
    setHighlightedMessageId(messageId);
    window.setTimeout(() => {
      const distanceFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      isNearBottomRef.current = isWithinLooseNearBottomThreshold(distanceFromBottom);
      bottomLockRef.current = isWithinBottomLockThreshold(distanceFromBottom);
      if (selectedChat) setChatScrollTop(selectedChat.id, scrollEl.scrollTop);
    }, 0);
    return true;
  };

  useEffect(() => {
    if (pendingThreadContextJumpId === null) return;
    if (!renderedMessages.some((message) => message.id === pendingThreadContextJumpId)) return;

    const messageId = pendingThreadContextJumpId;
    setPendingThreadContextJumpId(null);
    const frame = window.requestAnimationFrame(() => {
      if (!jumpToMessage(messageId)) {
        setThreadContextJumpError('That message is not visible in the current chat view.');
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingThreadContextJumpId, renderedMessages]);

  useEffect(() => {
    if (!replyContext.threadAnchor || !replyContext.threadReplyTarget) return;
    // While context is open, the shared composer should continue the visible
    // chain by default instead of sending an unthreaded Telegram message.
    setReplyingTo((current) => (current?.id === replyContext.threadReplyTarget?.id ? current : replyContext.threadReplyTarget));
  }, [replyContext.threadAnchor, replyContext.threadReplyTarget]);

  const handleSendMessage = async () => {
    if (!canStartTelegramSend(composerText, sending)) return;

    primeTelegramSentSound();
    const attemptedText = composerText;
    const followSentMessagesToBottom = bottomLockRef.current;
    const replyParent = replyingTo || replyContext.threadReplyTarget;
    setComposerText('');
    const result = await sendMessage(attemptedText, replyParent);
    shouldScrollToBottomRef.current = followSentMessagesToBottom;
    if (followSentMessagesToBottom) {
      bottomLockRef.current = true;
      isNearBottomRef.current = true;
    }
    if (result.ok) {
      playTelegramSentSound();
      if (selectedChat && replyParent && !replyParent.isOutgoing) {
        markReadMarker(selectedChat.id, replyParent.id);
      }
      if (replyContext.threadAnchor) {
        replyContext.appendMessagesToThread(result.sentMessages);
        setReplyingTo(result.sentMessages.at(-1) || replyContext.threadReplyTarget);
      } else {
        setReplyingTo(null);
      }
    } else {
      setComposerText((current) => recoverFailedTelegramDraft(current, result.unsentText));
    }
  };

  const handleReplyFromThread = (message: TelegramMessage) => {
    setReplyingTo(message);
    focusTelegramComposerAfterReply(composerRef.current);
  };

  const handleReplyFromMessage = (message: TelegramMessage) => {
    setReplyingTo(message);
    focusTelegramComposerAfterReply(composerRef.current);
  };

  const handleCloseThread = () => {
    // Closing the modal exits its temporary reply mode; explicit non-modal
    // replies still use the normal Reply button flow.
    replyContext.closeThread();
    setReplyingTo(null);
    setThreadContextJumpError(null);
  };

  const handleJumpToThreadMessage = (message: TelegramReplyContextMessage) => {
    if (!selectedChat || message.status !== 'loaded' || message.chatId !== selectedChat.id) {
      setThreadContextJumpError('That message is not visible in the current chat view.');
      return;
    }

    if (!visibleMessages.some((visibleMessage) => visibleMessage.id === message.id)) {
      setThreadContextJumpError('That message is not loaded in the current chat view.');
      return;
    }

    setThreadContextJumpError(null);
    replyContext.closeThread();
    setReplyingTo(null);

    if (!renderedMessages.some((renderedMessage) => renderedMessage.id === message.id)) {
      setPendingThreadContextJumpId(message.id);
      onMessageFilterChange('all');
      return;
    }

    window.requestAnimationFrame(() => {
      if (!jumpToMessage(message.id)) {
        setThreadContextJumpError('That message is not visible in the current chat view.');
      }
    });
  };

  const renderChatRow = (chat: (typeof chats)[number]) => (
    <button
      key={chat.id}
      onClick={() => selectChat(chat)}
      className={`relative w-full border-b px-3 py-3 text-left transition-colors hover:bg-mc-bg-tertiary/50 ${selectedChat?.id === chat.id ? 'border-l-[14px] border-l-mc-accent border-b-mc-accent/60 bg-mc-accent/35 shadow-[inset_0_0_0_1px_rgba(88,166,255,0.38)]' : 'border-l-4 border-l-transparent border-b-mc-border/30'}`}
    >
      {selectedChat?.id === chat.id && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-mc-accent shadow-[0_0_8px_rgba(88,166,255,0.9)]" aria-label="Selected chat" />}
      <div className="flex items-center gap-2 pr-3">
        <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-base leading-none ${selectedChat?.id === chat.id ? 'bg-mc-accent/45 ring-2 ring-mc-accent/80' : 'bg-mc-bg-tertiary'}`}>
          {getTelegramChatEmoji(chat)}
        </span>
        <span className={`min-w-0 flex-1 truncate text-sm font-semibold leading-snug ${selectedChat?.id === chat.id ? 'text-white' : 'text-[#eef2f7]'}`}>{chat.title}</span>
        {chat.unreadCount > 0 && (
          <span className="rounded-full bg-mc-accent px-1.5 text-[10px] font-bold text-mc-bg">{chat.unreadCount}</span>
        )}
      </div>
      {chat.lastMessagePreview && <p className={`mt-1 truncate text-[10px] leading-tight ${selectedChat?.id === chat.id ? 'text-[#d7e3ef]' : 'text-[#9aa6b2]'}`}>{chat.lastMessagePreview}</p>}
    </button>
  );

  const renderMessageMarkerButton = (chatId: string, messageId: number) => {
    const markerState = getMarkerState(chatId, messageId);
    const showReplyTargetMarker = shouldShowReplyTargetMarker(
      messageId,
      activeReplyTargetId,
      markerState.displayState,
      activeMessageFilter,
    );

    if (activeMessageFilter === 'unread') {
      const readLabel = 'Mark this message read locally';
      const starLabel = 'Mark this message read and star for follow-up';

      // The unread view is a triage queue, so it offers explicit "done" and
      // "follow up" exits instead of the normal compact marker cycle.
      return (
        <div className="flex items-center gap-1" aria-label="Unread message marker actions">
          <button
            type="button"
            onClick={() => markReadMarker(chatId, messageId)}
            aria-label={readLabel}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-mc-border text-transparent leading-none transition-colors hover:border-mc-accent hover:text-mc-accent"
            title={readLabel}
          >
            ✓
          </button>
          <button
            type="button"
            onClick={() => markReadAndStarredMarker(chatId, messageId)}
            aria-label={starLabel}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-mc-border bg-transparent text-xs leading-none text-[#9aa6b2] transition-colors hover:border-yellow-300 hover:text-yellow-300"
            title={starLabel}
          >
            ☆
          </button>
        </div>
      );
    }

    const markerLabel = markerState.displayState === 'starred'
      ? 'Clear local read and follow-up markers'
      : markerState.displayState === 'read'
        ? 'Star this message for follow-up'
        : 'Mark this message read locally';
    const markerTitle = showReplyTargetMarker
      ? 'Reply target · Mark this message read locally'
      : markerLabel;
    const markerClassName = markerState.displayState === 'starred'
      ? 'border-yellow-300 bg-yellow-300 text-mc-bg shadow-[0_0_8px_rgba(253,224,71,0.35)] hover:border-yellow-200 hover:bg-yellow-200'
      : markerState.displayState === 'read'
        ? 'border-mc-accent bg-mc-accent text-mc-bg shadow-[0_0_8px_rgba(88,166,255,0.35)] hover:border-[#8ec5ff] hover:bg-[#8ec5ff]'
        : showReplyTargetMarker
          ? 'border-mc-accent/70 bg-mc-accent/10 text-mc-accent hover:border-mc-accent hover:bg-mc-accent/15'
          : 'border-mc-border text-transparent hover:border-mc-accent hover:text-mc-accent';

    return (
      <button
        type="button"
        onClick={() => cycleMarker(chatId, messageId)}
        aria-label={markerLabel}
        className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs leading-none transition-colors ${markerClassName}`}
        title={markerTitle}
      >
        {markerState.displayState === 'starred' ? '★' : markerState.displayState === 'read' ? '✓' : showReplyTargetMarker ? <span className="translate-y-px">↩</span> : ''}
      </button>
    );
  };

  const chatList = (
    <div className="flex h-full flex-col">
      {loadingChats ? (
        <div className="flex flex-1 items-center justify-center text-xs text-[#9aa6b2]">
          <Loader className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading chats…
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {chatPriorityGroups.priorityChats.map(renderChatRow)}
          {showChatPrioritySeparator && <div className="h-2 border-t border-mc-border/50 bg-gray-400/20" aria-hidden="true" />}
          {chatPriorityGroups.otherChats.map(renderChatRow)}
        </div>
      )}
    </div>
  );

  const thread = selectedChat ? (
    <div className="flex h-full min-w-0 flex-col">
      {!isExpanded && (
        <button onClick={clearSelection} className="flex items-center gap-1 border-b border-mc-border px-3 py-2 text-xs hover:bg-mc-bg-tertiary">
          <ChevronLeft className="h-3.5 w-3.5" /> {selectedChat.title}
        </button>
      )}
      {loadingMessages ? (
        <div className="flex flex-1 items-center justify-center text-xs text-[#9aa6b2]">
          <Loader className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading messages…
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={handleThreadScroll}
            onWheel={handleThreadWheel}
            onTouchStart={handleThreadTouchStart}
            onTouchMove={handleThreadTouchMove}
            className="h-full space-y-2 overflow-y-auto p-3"
          >
            {hasOlderMessages && messages.length > 0 && (
              <div className="flex justify-center">
                <button
                  onClick={handleLoadOlderMessages}
                  disabled={loadingOlder}
                  className="rounded-full border border-mc-border px-2.5 py-1 text-[10px] text-[#9aa6b2] hover:border-mc-accent hover:text-mc-accent disabled:opacity-50"
                >
                  {loadingOlder ? 'Loading…' : 'Load older'}
                </button>
              </div>
            )}
            {renderedMessages.map((message) => (
              <div key={message.id} data-message-id={message.id} data-telegram-message-id={message.id}>
                <TelegramMessageBubble
                  message={message}
                  preview={replyContext.inlinePreviewByMessageId[message.id]}
                  compact
                  canOpenThread={replyContext.canOpenThread(message)}
                  onOpenThread={(threadMessage) => void replyContext.openThread(threadMessage)}
                  onReply={handleReplyFromMessage}
                  showReadMarker={!message.isOutgoing && Boolean(selectedChat)}
                  readMarkerNode={selectedChat ? renderMessageMarkerButton(selectedChat.id, message.id) : undefined}
                  highlighted={highlightedMessageId === message.id}
                  chatTitle={selectedChat?.title}
                />
              </div>
            ))}
          </div>
          {unseenNewMessageCount > 0 && (
            <button
              type="button"
              onClick={jumpToLatestMessages}
              className="absolute bottom-3 right-3 rounded-full border border-mc-accent/70 bg-mc-bg px-2.5 py-1 text-[10px] font-semibold text-mc-accent shadow-lg shadow-black/30 hover:bg-mc-bg-tertiary"
            >
              {unseenNewMessageCount === 1 ? 'New' : `${unseenNewMessageCount} new`} · Jump
            </button>
          )}
            </div>
      )}
      <div className="border-t border-mc-border p-2">
        {replyingTo && (
          <div className="mb-1.5 flex items-center gap-2 rounded border border-mc-border bg-mc-bg px-2 py-1 text-[10px] text-[#9aa6b2]">
            <span className="min-w-0 flex-1 truncate">Replying to: {replyingTo.text}</span>
            <button onClick={() => setReplyingTo(null)} className="hover:text-mc-accent">Cancel</button>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            ref={composerRef}
            value={composerText}
            onChange={(event) => setComposerText(event.target.value)}
            onKeyDown={(event) => {
              if (shouldSendTelegramComposerFromKeyDown(event.key, event.shiftKey)) {
                event.preventDefault();
                void handleSendMessage();
              }
            }}
            rows={1}
            className="min-h-[34px] flex-1 resize-none rounded border border-mc-border bg-[#111923] px-2 py-1.5 text-sm text-[#fbfdff] outline-none placeholder:text-[#7b8794] focus:border-mc-accent"
            placeholder="Message…"
          />
          <button onClick={() => void handleSendMessage()} disabled={!canStartTelegramSend(composerText, sending)} className={telegramSendButtonClassName(sending, true)}>
            {sending ? '…' : 'Send'}
          </button>
        </div>
        {composerChunkCount > 1 && (
          <p className="mt-1 text-[10px] text-mc-accent">Will send as {composerChunkCount} messages of up to {TELEGRAM_TEXT_MESSAGE_LIMIT} chars</p>
        )}
      </div>
    </div>
  ) : (
    <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-[#9aa6b2]">Select a Telegram group chat.</div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col text-[#f5f7fb]" style={{ fontFamily: CHAT_FONT_FAMILY }}>
      {error && <div className="border-b border-red-500/20 bg-red-500/10 px-3 py-1.5 text-[10px] text-red-300">{error}</div>}
      {isExpanded ? (
        <div className="flex min-h-0 flex-1">
          <div className="w-[175px] border-r border-mc-border">{chatList}</div>
          <div className="min-w-0 flex-1">{thread}</div>
        </div>
      ) : selectedChat ? (
        thread
      ) : (
        chatList
      )}
      <TelegramReplyContextModal
        open={Boolean(replyContext.threadAnchor)}
        title="Thread"
        messages={replyContext.threadMessages}
        loading={replyContext.threadLoading}
        loadingEarlier={replyContext.threadLoadingEarlier}
        hasEarlier={replyContext.threadHasEarlier}
        error={threadContextJumpError || replyContext.threadError}
        onClose={handleCloseThread}
        onLoadEarlier={() => void replyContext.loadEarlierInThread()}
        onReply={handleReplyFromThread}
        onJumpToMessage={handleJumpToThreadMessage}
        chatTitle={selectedChat?.title}
      />
    </div>
  );
}
