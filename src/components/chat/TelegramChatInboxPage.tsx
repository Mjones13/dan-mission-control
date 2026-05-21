'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Loader, MessageSquare } from 'lucide-react';
import { TELEGRAM_TEXT_MESSAGE_LIMIT, splitTelegramMessageText } from '@/lib/telegram/message-chunks';
import { useTelegramChatInbox, type TelegramMessage } from './useTelegramChatInbox';
import { getTelegramChatEmoji, visibleTelegramMessages } from './telegramChatDisplay';
import { useTelegramAgentReadMarkers } from './useTelegramAgentReadMarkers';
import { playTelegramSentSound, primeTelegramSentSound } from '@/lib/audio/telegramSentSound';
import { canStartTelegramSend, recoverFailedTelegramDraft, shouldSendTelegramComposerFromKeyDown, telegramSendButtonClassName } from './telegramComposerSendState';
import { useTelegramReplyContext } from './useTelegramReplyContext';
import { TelegramMessageBubble, TelegramReplyContextModal } from './TelegramReplyContextViews';
import { createLoadedDirectRepliesByParentId, telegramDisplaySenderLabel } from './telegramReplyContext';
import { filterTelegramMessagesForView, type TelegramMessageViewFilter } from './telegramMessageViews';
import {
  appendedMessageCount,
  classifyMessageListChange,
  getScrollBottom,
  scrollTopForPreservedBottom,
  shouldRestoreOlderMessageAnchor,
} from './telegramScrollAnchoring';

const CHAT_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';

type ScrollSnapshot = {
  scrollTop: number;
};

function getScrollSnapshot(el: HTMLDivElement): ScrollSnapshot {
  return { scrollTop: el.scrollTop };
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
  const [openChildReplyMenuFor, setOpenChildReplyMenuFor] = useState<number | null>(null);
  const { getMarkerState, markReadMarker, markReplyParentsRead, cycleMarker } = useTelegramAgentReadMarkers();
  const replyContext = useTelegramReplyContext({ chatId: selectedChatId, messages });
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(true);
  const isNearBottomRef = useRef(true);
  const scrollStateRef = useRef<{ chatId: string | null; messageIds: number[] }>({ chatId: null, messageIds: [] });
  const preRenderScrollSnapshotRef = useRef<ScrollSnapshot | null>(null);
  const loadOlderAnchorPendingRef = useRef<{ chatId: string; scrollBottom: number } | null>(null);
  const [unseenNewMessageCount, setUnseenNewMessageCount] = useState(0);
  const previousChatIdRef = useRef<string | null>(null);
  const trimmedComposerText = composerText.trim();
  const composerChunks = splitTelegramMessageText(trimmedComposerText);
  const composerChunkCount = composerChunks.length;
  const visibleMessages = useMemo(() => visibleTelegramMessages(messages), [messages]);
  const renderedMessages = useMemo(() => {
    if (!selectedChatId) return visibleMessages;
    return filterTelegramMessagesForView(visibleMessages, activeMessageFilter, (messageId) => getMarkerState(selectedChatId, messageId));
  }, [activeMessageFilter, getMarkerState, selectedChatId, visibleMessages]);
  const directRepliesByParentId = useMemo(() => createLoadedDirectRepliesByParentId(renderedMessages), [renderedMessages]);

  useEffect(() => {
    const previousChatId = previousChatIdRef.current;
    if (selectedChatId && previousChatId !== selectedChatId) {
      shouldScrollToBottomRef.current = !selectedCacheEntry?.messages.length;
      isNearBottomRef.current = true;
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
    const wasNearBottom = isNearBottomRef.current;

    if (chatChanged) {
      if (selectedCacheEntry?.scrollTop !== undefined && currentMessageIds.length > 0) {
        el.scrollTop = selectedCacheEntry.scrollTop;
      } else {
        el.scrollTop = el.scrollHeight;
      }
      setUnseenNewMessageCount(0);
    } else if (shouldRestoreOlderMessageAnchor(messageListChange, loadOlderAnchorPendingRef.current?.chatId === selectedChatId) && loadOlderAnchorPendingRef.current) {
      el.scrollTop = scrollTopForPreservedBottom(el.scrollHeight, loadOlderAnchorPendingRef.current.scrollBottom, el.clientHeight);
      const newCount = appendedMessageCount(previousScrollState.messageIds, currentMessageIds);
      if (newCount > 0) {
        setUnseenNewMessageCount((count) => count + newCount);
      }
    } else if (shouldScrollToBottomRef.current || wasNearBottom) {
      el.scrollTop = el.scrollHeight;
      setUnseenNewMessageCount(0);
    } else if ((messageListChange === 'append' || messageListChange === 'prepend' || messageListChange === 'mixed') && beforeSnapshot) {
      el.scrollTop = beforeSnapshot.scrollTop;
      const newCount = appendedMessageCount(previousScrollState.messageIds, currentMessageIds);
      if (newCount > 0) {
        setUnseenNewMessageCount((count) => count + newCount);
      }
    } else if (selectedCacheEntry?.scrollTop !== undefined) {
      el.scrollTop = selectedCacheEntry.scrollTop;
    }

    shouldScrollToBottomRef.current = false;
    preRenderScrollSnapshotRef.current = null;
    loadOlderAnchorPendingRef.current = null;
    scrollStateRef.current = { chatId: selectedChatId, messageIds: currentMessageIds };
    if (selectedCacheEntry?.scrollTop !== el.scrollTop) {
      setChatScrollTop(selectedChatId, el.scrollTop);
    }

    return () => {
      preRenderScrollSnapshotRef.current = getScrollSnapshot(el);
    };
  }, [renderedMessages, selectedCacheEntry?.scrollTop, selectedChatId, setChatScrollTop]);

  useEffect(() => {
    if (highlightedMessageId === null) return;
    const timeout = window.setTimeout(() => setHighlightedMessageId(null), 1800);
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
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 80;
    if (isNearBottomRef.current) {
      setUnseenNewMessageCount(0);
    }
    setChatScrollTop(selectedChatId, el.scrollTop);
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
    await loadOlderMessages();
  };

  const jumpToMessage = (messageId: number) => {
    const scrollEl = scrollRef.current;
    const targetEl = scrollEl?.querySelector<HTMLElement>(`[data-telegram-message-id="${messageId}"]`);
    if (!scrollEl || !targetEl) return;

    shouldScrollToBottomRef.current = false;
    targetEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setHighlightedMessageId(messageId);
    setOpenChildReplyMenuFor(null);
    window.setTimeout(() => {
      const distanceFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      isNearBottomRef.current = distanceFromBottom < 80;
      if (selectedChatId) setChatScrollTop(selectedChatId, scrollEl.scrollTop);
    }, 0);
  };

  const jumpToLatestMessages = () => {
    const el = scrollRef.current;
    shouldScrollToBottomRef.current = true;
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
    const followSentMessagesToBottom = isNearBottomRef.current;
    const replyParent = replyingTo || replyContext.threadReplyTarget;
    setComposerText('');
    const result = await sendMessage(attemptedText, replyParent);
    shouldScrollToBottomRef.current = followSentMessagesToBottom;
    if (followSentMessagesToBottom) isNearBottomRef.current = true;
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
  };

  const handleCloseThread = () => {
    // Closing the modal exits its temporary reply mode; explicit non-modal
    // replies still use the normal Reply button flow.
    replyContext.closeThread();
    setReplyingTo(null);
  };

  const renderMessageMarkerButton = (chatId: string, messageId: number) => {
    const markerState = getMarkerState(chatId, messageId);
    const markerLabel = markerState.displayState === 'starred'
      ? 'Clear local read and follow-up markers'
      : markerState.displayState === 'read'
        ? 'Star this message for follow-up'
        : 'Mark this message read locally';
    const markerClassName = markerState.displayState === 'starred'
      ? 'border-yellow-300 bg-yellow-300 text-mc-bg shadow-[0_0_8px_rgba(253,224,71,0.35)] hover:border-yellow-200 hover:bg-yellow-200'
      : markerState.displayState === 'read'
        ? 'border-mc-accent bg-mc-accent text-mc-bg shadow-[0_0_8px_rgba(88,166,255,0.35)] hover:border-[#8ec5ff] hover:bg-[#8ec5ff]'
        : 'border-mc-border text-transparent hover:border-mc-accent hover:text-mc-accent';

    return (
      <button
        type="button"
        onClick={() => cycleMarker(chatId, messageId)}
        aria-label={markerLabel}
        className={`flex h-6 w-6 items-center justify-center rounded-full border text-sm leading-none transition-colors ${markerClassName}`}
        title={markerLabel}
      >
        {markerState.displayState === 'starred' ? '★' : markerState.displayState === 'read' ? '✓' : ''}
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

    return (
      <div className="relative">
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
          className="flex h-6 min-w-6 items-center justify-center rounded-full border border-mc-border px-1.5 text-xs leading-none text-[#9aa6b2] transition-colors hover:border-mc-accent hover:text-mc-accent"
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

  const renderFilterButton = (filter: TelegramMessageViewFilter, label: string) => {
    const active = activeMessageFilter === filter;
    return (
      <button
        type="button"
        onClick={() => setActiveMessageFilter(filter)}
        aria-pressed={active}
        className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${active ? 'border-mc-accent bg-mc-accent text-mc-bg' : 'border-mc-border text-[#9aa6b2] hover:border-mc-accent hover:text-mc-accent'}`}
      >
        {label}
      </button>
    );
  };

  return (
    <main className="min-h-screen bg-mc-bg p-2 text-[#f5f7fb] md:p-4" style={{ fontFamily: CHAT_FONT_FAMILY }}>
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
                {chats.map((chat) => (
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
                ))}
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
                    {renderFilterButton('all', 'All')}
                    {renderFilterButton('unread', 'Unread')}
                    {renderFilterButton('starred', '★ Starred')}
                  </div>
                </header>
                <div className="relative min-h-0 flex-1">
                  <div ref={scrollRef} onScroll={handleThreadScroll} className="h-full space-y-2.5 overflow-y-auto p-3">
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
                    {renderedMessages.map((message) => {
                      const directReplies = directRepliesByParentId.get(message.id) || [];

                      return (
                        <div
                          key={message.id}
                          data-message-id={message.id}
                          data-telegram-message-id={message.id}
                          className={`rounded-xl transition-[background-color,box-shadow] duration-300 ${highlightedMessageId === message.id ? 'bg-mc-accent/10 shadow-[0_0_0_2px_rgba(88,166,255,0.65)]' : ''}`}
                        >
                          <TelegramMessageBubble
                            message={message}
                            preview={replyContext.inlinePreviewByMessageId[message.id]}
                            canOpenThread={replyContext.canOpenThread(message)}
                            onOpenThread={(threadMessage) => void replyContext.openThread(threadMessage)}
                            onReply={setReplyingTo}
                            showReadMarker={!message.isOutgoing && Boolean(selectedChatId)}
                            readMarkerNode={selectedChatId ? renderMessageMarkerButton(selectedChatId, message.id) : undefined}
                            childNavigationNode={renderChildNavigationButton(message, directReplies)}
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
          error={replyContext.threadError}
          onClose={handleCloseThread}
          onLoadEarlier={() => void replyContext.loadEarlierInThread()}
          onReply={handleReplyFromThread}
          chatTitle={selectedChatTitle}
        />
      </div>
    </main>
  );
}
