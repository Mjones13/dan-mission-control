'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Loader, MessageSquare } from 'lucide-react';
import { TELEGRAM_TEXT_MESSAGE_LIMIT, splitTelegramMessageText } from '@/lib/telegram/message-chunks';
import { useTelegramChatInbox, type TelegramMessage } from './useTelegramChatInbox';
import { getTelegramChatEmoji } from './telegramChatDisplay';
import { useTelegramAgentReadMarkers } from './useTelegramAgentReadMarkers';
import { playTelegramSentSound, primeTelegramSentSound } from '@/lib/audio/telegramSentSound';
import { canStartTelegramSend, recoverFailedTelegramDraft, shouldSendTelegramComposerFromKeyDown, telegramSendButtonClassName } from './telegramComposerSendState';
import { useTelegramReplyContext } from './useTelegramReplyContext';
import { TelegramMessageBubble, TelegramReplyContextModal } from './TelegramReplyContextViews';

const CHAT_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';

export function TelegramChatInboxPage() {
  const {
    chats,
    selectedChatId,
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
  const { isMarkedRead, markReadMarker, markReplyParentsRead, toggleReadMarker } = useTelegramAgentReadMarkers();
  const replyContext = useTelegramReplyContext({ chatId: selectedChatId, messages });
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(true);
  const isNearBottomRef = useRef(true);
  const previousChatIdRef = useRef<string | null>(null);
  const trimmedComposerText = composerText.trim();
  const composerChunks = splitTelegramMessageText(trimmedComposerText);
  const composerChunkCount = composerChunks.length;

  useEffect(() => {
    const previousChatId = previousChatIdRef.current;
    if (selectedChatId && previousChatId !== selectedChatId) {
      shouldScrollToBottomRef.current = !selectedCacheEntry?.messages.length;
      isNearBottomRef.current = true;
      setReplyingTo(null);
      replyContext.closeThread();
    }
    previousChatIdRef.current = selectedChatId;
  }, [replyContext, selectedCacheEntry?.messages.length, selectedChatId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !selectedChatId) return;

    if (shouldScrollToBottomRef.current || isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    } else if (selectedCacheEntry?.scrollTop !== undefined) {
      el.scrollTop = selectedCacheEntry.scrollTop;
    }
    shouldScrollToBottomRef.current = false;
  }, [messages, selectedCacheEntry?.scrollTop, selectedChatId]);

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
    setChatScrollTop(selectedChatId, el.scrollTop);
  };

  const handleLoadOlderMessages = async () => {
    shouldScrollToBottomRef.current = false;
    await loadOlderMessages();
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
                <div ref={scrollRef} onScroll={handleThreadScroll} className="flex-1 space-y-2.5 overflow-y-auto p-3">
                  <button
                    onClick={backToList}
                    className="mb-1 flex items-center gap-1 rounded px-2 py-1 text-xs text-[#9aa6b2] transition-colors hover:bg-mc-bg-tertiary hover:text-[#f5f7fb] md:hidden"
                    title="Back to chats"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back to chats
                  </button>
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
                  {messages.map((message) => (
                    <TelegramMessageBubble
                      key={message.id}
                      message={message}
                      preview={replyContext.inlinePreviewByMessageId[message.id]}
                      canOpenThread={replyContext.canOpenThread(message)}
                      onOpenThread={(threadMessage) => void replyContext.openThread(threadMessage)}
                      onReply={setReplyingTo}
                      showReadMarker={!message.isOutgoing && Boolean(selectedChatId)}
                      readMarked={selectedChatId ? isMarkedRead(selectedChatId, message.id) : false}
                      onToggleRead={selectedChatId ? () => toggleReadMarker(selectedChatId, message.id) : undefined}
                    />
                  ))}
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
          title="Telegram reply chain"
          messages={replyContext.threadMessages}
          loading={replyContext.threadLoading}
          loadingEarlier={replyContext.threadLoadingEarlier}
          hasEarlier={replyContext.threadHasEarlier}
          error={replyContext.threadError}
          onClose={handleCloseThread}
          onLoadEarlier={() => void replyContext.loadEarlierInThread()}
          onReply={handleReplyFromThread}
        />
      </div>
    </main>
  );
}
