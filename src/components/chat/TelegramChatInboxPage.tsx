'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type TouchEvent, type WheelEvent } from 'react';
import { ChevronLeft, Loader, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { TELEGRAM_TEXT_MESSAGE_LIMIT, splitTelegramMessageText } from '@/lib/telegram/message-chunks';
import { useTelegramChatInbox, type TelegramMessage } from './useTelegramChatInbox';
import { getTelegramChatEmoji, isTelegramBridgeStatusText, visibleTelegramMessages } from './telegramChatDisplay';
import { useTelegramAgentReadMarkers } from './useTelegramAgentReadMarkers';
import { playTelegramSentSound, primeTelegramSentSound } from '@/lib/audio/telegramSentSound';
import { canStartTelegramSend, recoverFailedTelegramDraft, shouldSendTelegramComposerFromKeyDown, telegramSendButtonClassName } from './telegramComposerSendState';
import { focusTelegramComposerAfterReply } from './telegramComposerFocus';
import { useTelegramReplyContext } from './useTelegramReplyContext';
import { TelegramMessageBubble, TelegramReplyContextModal } from './TelegramReplyContextViews';
import { createLoadedDirectRepliesByParentId, telegramDisplaySenderLabel, type TelegramReplyContextMessage } from './telegramReplyContext';
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
const CHILD_REPLY_MENU_ROOT_SELECTOR = '[data-child-reply-menu-root]';

export function isInsideChildReplyMenuRoot(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(CHILD_REPLY_MENU_ROOT_SELECTOR) !== null;
}

function getScrollSnapshot(el: HTMLDivElement): ScrollSnapshot {
  return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight };
}

function isJumpToLatestActionableMessage(message: TelegramMessage): boolean {
  return !isTelegramBridgeStatusText(message.text);
}

export function TelegramChatInboxPage() {
  const {
    chats,
    selectedChatId,
    selectedChatTitle,
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
  const [activeMessageFilter, setActiveMessageFilter] = useState<TelegramMessageViewFilter>('all');
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const [pendingThreadContextJumpId, setPendingThreadContextJumpId] = useState<number | null>(null);
  const [threadContextJumpError, setThreadContextJumpError] = useState<string | null>(null);
  const [openChildReplyMenuFor, setOpenChildReplyMenuFor] = useState<number | null>(null);
  const { getMarkerState, markReadMarker, markReadAndStarredMarker, markReplyParentsRead, cycleMarker } = useTelegramAgentReadMarkers();
  const replyContext = useTelegramReplyContext({ chatId: selectedChatId, messages });
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
    if (!selectedChatId) return visibleMessages;
    // Filters are intentionally client-side over currently loaded text messages.
    // The read/starred state is Mission Control-local and should not trigger a
    // Telegram history scan or change Telegram's native read state.
    return filterTelegramMessagesForView(visibleMessages, activeMessageFilter, (messageId) => getMarkerState(selectedChatId, messageId));
  }, [activeMessageFilter, getMarkerState, selectedChatId, visibleMessages]);
  // Build reply-jump affordances from the rendered list, not the full cache, so
  // every child target is present in the DOM when jumpToMessage runs.
  const directRepliesByParentId = useMemo(
    () => createLoadedDirectRepliesByParentId(renderedMessages),
    [renderedMessages],
  );
  const chatPriorityGroups = useMemo(() => groupTelegramChatsByPriority(chats), [chats]);
  const showChatPrioritySeparator = shouldRenderTelegramChatPrioritySeparator(chatPriorityGroups);

  useEffect(() => {
    if (openChildReplyMenuFor === null) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (isInsideChildReplyMenuRoot(event.target)) return;
      setOpenChildReplyMenuFor(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpenChildReplyMenuFor(null);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [openChildReplyMenuFor]);

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
    const previousChatId = previousChatIdRef.current;
    if (selectedChatId && previousChatId !== selectedChatId) {
      shouldScrollToBottomRef.current = !selectedCacheEntry?.messages.length;
      bottomLockRef.current = !selectedCacheEntry?.messages.length;
      isNearBottomRef.current = true;
      lastKnownScrollTopRef.current = selectedCacheEntry?.scrollTop || 0;
      setReplyingTo(null);
      setActiveMessageFilter('all');
      setOpenChildReplyMenuFor(null);
      replyContext.closeThread();
    }
    previousChatIdRef.current = selectedChatId;
  }, [replyContext, selectedCacheEntry?.messages.length, selectedChatId]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const currentMessageIds = renderedMessages.map((message) => message.id);
    const previousScrollState = scrollStateRef.current;

    if (!el || !selectedChatId) {
      scrollStateRef.current = { chatId: selectedChatId, messageIds: currentMessageIds };
      return;
    }

    const chatChanged = previousScrollState.chatId !== selectedChatId;
    const messageListChange = chatChanged
      ? 'replace'
      : classifyMessageListChange(previousScrollState.messageIds, currentMessageIds);
    const beforeSnapshot = preRenderScrollSnapshotRef.current;
    const wasBottomLocked = bottomLockRef.current;

    const manualReplyJumpGuard = manualReplyJumpGuardRef.current;
    const manualReplyJumpInProgress =
      manualReplyJumpGuard?.chatId === selectedChatId &&
      !isManualReplyJumpComplete(manualReplyJumpGuard, el);

    if (manualReplyJumpInProgress) {
      // Manual smooth reply jumps own scroll position briefly. Do not let normal
      // chat-change/near-bottom/cache restoration snap over the in-flight jump.
    } else {
      if (manualReplyJumpGuard?.chatId === selectedChatId) {
        clearManualReplyJumpGuard();
      }

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
      } else if (
        shouldRestoreOlderMessageAnchor(
          messageListChange,
          loadOlderAnchorPendingRef.current?.chatId === selectedChatId,
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
    }

    shouldScrollToBottomRef.current = false;
    preRenderScrollSnapshotRef.current = null;
    loadOlderAnchorPendingRef.current = null;
    scrollStateRef.current = { chatId: selectedChatId, messageIds: currentMessageIds };
    lastKnownScrollTopRef.current = el.scrollTop;
    if (selectedCacheEntry?.scrollTop !== el.scrollTop) {
      setChatScrollTop(selectedChatId, el.scrollTop);
    }

    return () => {
      preRenderScrollSnapshotRef.current = getScrollSnapshot(el);
    };
  }, [renderedMessages, selectedCacheEntry?.scrollTop, selectedChatId, setChatScrollTop]);

  useEffect(() => {
    if (highlightedMessageId === null) return;
    const timeout = window.setTimeout(() => setHighlightedMessageId(null), MESSAGE_HIGHLIGHT_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [highlightedMessageId]);

  useEffect(() => {
    if (!selectedChatId) return;
    markReplyParentsRead(selectedChatId, messages);
  }, [markReplyParentsRead, messages, selectedChatId]);

  const backToList = () => {
    clearSelection();
    setComposerText('');
    setReplyingTo(null);
  };

  const handleThreadScroll = () => {
    const el = scrollRef.current;
    if (!el || !selectedChatId) return;
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
    setChatScrollTop(selectedChatId, el.scrollTop);
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
    if (el && selectedChatId) {
      loadOlderAnchorPendingRef.current = {
        chatId: selectedChatId,
        scrollBottom: getScrollBottom(el.scrollHeight, el.scrollTop, el.clientHeight),
      };
    }
    shouldScrollToBottomRef.current = false;
    bottomLockRef.current = false;
    await loadOlderMessages();
  };

  const jumpToMessage = (messageId: number) => {
    const scrollEl = scrollRef.current;
    const selector = `[data-telegram-message-id="${messageId}"]`;
    const targetEl = scrollEl?.querySelector<HTMLElement>(selector);
    if (!scrollEl || !targetEl || !selectedChatId) return false;

    // Manual jumps should not be overridden by the normal "near bottom" auto
    // scroll path on the next render; the short highlight makes the landing
    // point visible after smooth scrolling.
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
      chatId: selectedChatId,
      messageId,
      targetScrollTop: normalizedTargetScrollTop,
      startedAt: window.performance.now(),
    });
    scrollEl.scrollTo({ top: normalizedTargetScrollTop, behavior: 'smooth' });
    setHighlightedMessageId(messageId);
    setOpenChildReplyMenuFor(null);
    window.setTimeout(() => {
      const distanceFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      isNearBottomRef.current = isWithinLooseNearBottomThreshold(distanceFromBottom);
      bottomLockRef.current = isWithinBottomLockThreshold(distanceFromBottom);
      if (selectedChatId) setChatScrollTop(selectedChatId, scrollEl.scrollTop);
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

  const jumpToLatestMessages = () => {
    const el = scrollRef.current;
    shouldScrollToBottomRef.current = true;
    bottomLockRef.current = true;
    isNearBottomRef.current = true;
    setUnseenNewMessageCount(0);
    if (el) {
      el.scrollTop = el.scrollHeight;
      if (selectedChatId) {
        setChatScrollTop(selectedChatId, el.scrollTop);
      }
    }
  };

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
      if (selectedChatId && replyParent && !replyParent.isOutgoing) {
        markReadMarker(selectedChatId, replyParent.id);
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
    if (!selectedChatId || message.status !== 'loaded' || message.chatId !== selectedChatId) {
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
      setActiveMessageFilter('all');
      return;
    }

    window.requestAnimationFrame(() => {
      if (!jumpToMessage(message.id)) {
        setThreadContextJumpError('That message is not visible in the current chat view.');
      }
    });
  };

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

      // In the unread queue, expose the two triage exits directly: handled now
      // or handled later. Outside that queue the marker cycles through states.
      return (
        <div className="flex items-center gap-1" aria-label="Unread message marker actions">
          <button
            type="button"
            onClick={() => markReadMarker(chatId, messageId)}
            aria-label={readLabel}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-mc-border text-transparent leading-none transition-colors hover:border-mc-accent hover:text-mc-accent"
            title={readLabel}
          >
            ✓
          </button>
          <button
            type="button"
            onClick={() => markReadAndStarredMarker(chatId, messageId)}
            aria-label={starLabel}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-mc-border bg-transparent text-sm leading-none text-[#9aa6b2] transition-colors hover:border-yellow-300 hover:text-yellow-300"
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
        className={`flex h-6 w-6 items-center justify-center rounded-full border text-sm leading-none transition-colors ${markerClassName}`}
        title={markerTitle}
      >
        {markerState.displayState === 'starred' ? '★' : markerState.displayState === 'read' ? '✓' : showReplyTargetMarker ? <span className="translate-y-px">↩</span> : ''}
      </button>
    );
  };

  const formatChildReplyPreview = (message: TelegramMessage) => {
    const senderLabel = telegramDisplaySenderLabel(message, selectedChatTitle) || 'Reply';
    const snippet = message.text.replace(/\s+/g, ' ').trim() || 'Message';
    return `${senderLabel}: ${snippet}`;
  };

  const renderChildNavigationButton = (message: TelegramMessage, directReplies: TelegramMessage[]) => {
    if (directReplies.length === 0) return null;
    const hasMultipleReplies = directReplies.length > 1;
    const label = hasMultipleReplies ? `Show ${directReplies.length} replies` : 'Jump to reply';

    // Single child replies can be jumped to immediately. Multiple children are
    // sibling branches, so let the user choose instead of pretending there is a
    // canonical next message in the thread.
    return (
      <div className="relative" data-child-reply-menu-root>
        <button
          type="button"
          onClick={() => {
            if (hasMultipleReplies) {
              setOpenChildReplyMenuFor((current) => (current === message.id ? null : message.id));
            } else {
              jumpToMessage(directReplies[0].id);
            }
          }}
          aria-label={label}
          aria-expanded={hasMultipleReplies ? openChildReplyMenuFor === message.id : undefined}
          className="flex h-6 min-w-6 items-center justify-center px-1.5 text-xs leading-none text-[#9aa6b2] transition-colors hover:text-mc-accent"
          title={label}
        >
          ↓{hasMultipleReplies ? <span className="ml-0.5 text-[10px]">{directReplies.length}</span> : null}
        </button>
        {hasMultipleReplies && openChildReplyMenuFor === message.id && (
          <div className="absolute bottom-7 right-0 z-20 w-64 overflow-hidden rounded-lg border border-mc-border bg-mc-bg-secondary shadow-xl shadow-black/40">
            {directReplies.map((reply) => (
              <button
                key={reply.id}
                type="button"
                onClick={() => jumpToMessage(reply.id)}
                className="block w-full border-b border-mc-border/60 px-3 py-2 text-left text-[11px] text-[#cbd6e2] last:border-b-0 hover:bg-mc-bg-tertiary hover:text-white"
                title={formatChildReplyPreview(reply)}
              >
                <span className="block truncate">{formatChildReplyPreview(reply)}</span>
                <span className="mt-0.5 block text-[10px] text-[#778391]">{new Date(reply.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderFilterButton = (filter: Exclude<TelegramMessageViewFilter, 'all'>, label: string) => {
    const active = activeMessageFilter === filter;
    return (
      <button
        type="button"
        onClick={() => setActiveMessageFilter((current) => (current === filter ? 'all' : filter))}
        aria-pressed={active}
        className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${active ? 'border-mc-accent bg-mc-accent text-mc-bg' : 'border-mc-border text-[#9aa6b2] hover:border-mc-accent hover:text-mc-accent'}`}
      >
        {label}
      </button>
    );
  };

  const renderChatRow = (chat: (typeof chats)[number]) => (
    <button
      key={chat.id}
      onClick={() => selectChat(chat)}
      className={`relative flex w-full gap-3 border-b px-3 py-3.5 text-left transition-colors hover:bg-mc-bg-tertiary/50 ${selectedChatId === chat.id ? 'border-l-[14px] border-l-mc-accent border-b-mc-accent/60 bg-mc-accent/35 shadow-[inset_0_0_0_1px_rgba(88,166,255,0.38)]' : 'border-l-4 border-l-transparent border-b-mc-border/30'}`}
    >
      {selectedChatId === chat.id && <span className="absolute right-2 top-2 rounded-full bg-mc-accent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-mc-bg">Active</span>}
      <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xl leading-none ${selectedChatId === chat.id ? 'bg-mc-accent/45 text-mc-accent ring-2 ring-mc-accent/80' : 'bg-mc-bg-tertiary'}`}>
        {getTelegramChatEmoji(chat)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate text-base font-semibold leading-snug ${selectedChatId === chat.id ? 'pr-14 text-white' : 'text-[#eef2f7]'}`}>{chat.title}</span>
          {chat.unreadCount > 0 && (
            <span className="flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-mc-accent px-1 text-[10px] font-bold text-mc-bg">
              {chat.unreadCount}
            </span>
          )}
        </div>
        {chat.lastMessagePreview && (
          <p className={`mt-1 truncate text-[11px] leading-tight ${selectedChatId === chat.id ? 'text-[#d7e3ef]' : 'text-[#9aa6b2]'}`}>{chat.lastMessagePreview}</p>
        )}
        {chat.lastMessageAt && (
          <p className={`mt-1 text-[10px] ${selectedChatId === chat.id ? 'text-[#b9c8d8]' : 'text-[#778391]'}`}>{new Date(chat.lastMessageAt).toLocaleString()}</p>
        )}
      </div>
    </button>
  );

  return (
    <main className="min-h-screen bg-mc-bg p-2 text-[#f5f7fb] md:p-4" style={{ fontFamily: CHAT_FONT_FAMILY }}>
      <Link
        href="/"
        aria-label="Back to Mission Control home"
        title="Back to Mission Control home"
        className="fixed left-4 top-4 z-50 hidden items-center rounded-lg px-2 py-1 text-mc-text transition-colors hover:bg-mc-bg-tertiary 2xl:flex"
      >
        <span className="text-2xl leading-none" aria-hidden="true">🦞</span>
      </Link>

      <div className="mx-auto flex h-[calc(100vh-1rem)] max-w-[88rem] flex-col overflow-hidden rounded-2xl border border-mc-border bg-mc-bg-secondary shadow-2xl shadow-black/30 md:h-[calc(100vh-2rem)]">
        {error && (
          <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <aside className={`${selectedChatId ? 'hidden md:flex' : 'flex'} w-full flex-col border-r border-mc-border md:w-[240px]`}>
            {loadingChats ? (
              <div className="flex flex-1 items-center justify-center text-sm text-[#9aa6b2]">
                <Loader className="mr-2 h-4 w-4 animate-spin" /> Loading group chats…
              </div>
            ) : chats.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-sm text-[#9aa6b2]">
                <MessageSquare className="mb-3 h-10 w-10 opacity-30" />
                No Telegram group chats found.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {chatPriorityGroups.priorityChats.map(renderChatRow)}
                {showChatPrioritySeparator && <div className="h-2 border-t border-mc-border/50 bg-gray-400/20" aria-hidden="true" />}
                {chatPriorityGroups.otherChats.map(renderChatRow)}
              </div>
            )}
          </aside>

          <section className={`${selectedChatId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
            {!selectedChatId ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[#9aa6b2]">
                Select a Telegram group chat.
              </div>
            ) : loadingMessages ? (
              <div className="flex flex-1 items-center justify-center text-sm text-[#9aa6b2]">
                <Loader className="mr-2 h-4 w-4 animate-spin" /> Loading messages…
              </div>
            ) : (
              <>
                <header className="flex flex-wrap items-center gap-2 border-b border-mc-border px-3 py-2">
                  <button
                    onClick={backToList}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#9aa6b2] transition-colors hover:bg-mc-bg-tertiary hover:text-[#f5f7fb] md:hidden"
                    title="Back to chats"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-sm font-semibold text-[#f5f7fb]">{selectedChatTitle || 'Telegram group'}</h1>
                    {activeMessageFilter !== 'all' && (
                      <p className="text-[10px] text-[#778391]">
                        Showing {activeMessageFilter === 'unread' ? 'loaded local unread' : 'loaded starred'} messages in this chat.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {renderFilterButton('unread', 'Unread')}
                    {renderFilterButton('starred', '★ Starred')}
                  </div>
                </header>
                <div className="relative min-h-0 flex-1">
                  <div
                    ref={scrollRef}
                    onScroll={handleThreadScroll}
                    onWheel={handleThreadWheel}
                    onTouchStart={handleThreadTouchStart}
                    onTouchMove={handleThreadTouchMove}
                    className="h-full space-y-2.5 overflow-y-auto p-3"
                  >
                    {hasOlderMessages && messages.length > 0 && (
                      <div className="flex justify-center">
                        <button
                          onClick={handleLoadOlderMessages}
                          disabled={loadingOlder}
                          className="rounded-full border border-mc-border px-3 py-1 text-[10px] text-[#9aa6b2] transition-colors hover:border-mc-accent hover:text-mc-accent disabled:opacity-50"
                        >
                          {loadingOlder ? 'Loading…' : 'Load older messages'}
                        </button>
                      </div>
                    )}
                    {renderedMessages.length === 0 && (
                      <div className="rounded-lg border border-dashed border-mc-border bg-mc-bg/50 p-4 text-center text-xs text-[#9aa6b2]">
                        {activeMessageFilter === 'unread'
                          ? 'No loaded unread messages in this chat.'
                          : activeMessageFilter === 'starred'
                            ? 'No loaded starred messages in this chat.'
                            : 'No messages in this chat.'}
                      </div>
                    )}
                    {renderedMessages.map((message, index) => {
                      const directReplies = directRepliesByParentId.get(message.id) || [];

                      return (
                        <div
                          key={`${message.id}-${index}`}
                          data-message-id={message.id}
                          data-telegram-message-id={message.id}
                        >
                          <TelegramMessageBubble
                            message={message}
                            preview={replyContext.inlinePreviewByMessageId[message.id]}
                            canOpenThread={replyContext.canOpenThread(message)}
                            onOpenThread={(threadMessage) => void replyContext.openThread(threadMessage)}
                            onReply={handleReplyFromMessage}
                            showReadMarker={!message.isOutgoing && Boolean(selectedChatId)}
                            readMarkerNode={selectedChatId ? renderMessageMarkerButton(selectedChatId, message.id) : undefined}
                            childNavigationNode={renderChildNavigationButton(message, directReplies)}
                            highlighted={highlightedMessageId === message.id}
                            chatTitle={selectedChatTitle}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {unseenNewMessageCount > 0 && (
                    <button
                      type="button"
                      onClick={jumpToLatestMessages}
                      className="absolute bottom-3 right-4 rounded-full border border-mc-accent/70 bg-mc-bg px-3 py-1.5 text-[11px] font-semibold text-mc-accent shadow-lg shadow-black/30 transition-colors hover:border-mc-accent hover:bg-mc-bg-tertiary"
                    >
                      {unseenNewMessageCount === 1 ? 'New message' : `${unseenNewMessageCount} new messages`} · Jump to latest
                    </button>
                  )}
                </div>
                <div className="border-t border-mc-border p-3">
                  {replyingTo && (
                    <div className="mb-2 flex items-center gap-2 rounded border border-mc-border bg-mc-bg px-2 py-1 text-[10px] text-[#9aa6b2]">
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
                      rows={2}
                      className="min-h-[44px] flex-1 resize-none rounded-lg border border-mc-border bg-[#111923] px-3 py-2 text-sm text-[#fbfdff] outline-none transition-colors placeholder:text-[#7b8794] focus:border-mc-accent"
                      placeholder="Message this Telegram group…"
                    />
                    <button
                      onClick={() => void handleSendMessage()}
                      disabled={!canStartTelegramSend(composerText, sending)}
                      className={telegramSendButtonClassName(sending)}
                    >
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-[#778391]">
                    Plain text · Enter to send · Shift+Enter for newline
                    {composerChunkCount > 1 && <span className="ml-2 text-mc-accent">Will send as {composerChunkCount} messages of up to {TELEGRAM_TEXT_MESSAGE_LIMIT} chars</span>}
                  </p>
                </div>
              </>
            )}
          </section>
        </div>
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
          chatTitle={selectedChatTitle}
        />
      </div>
    </main>
  );
}
