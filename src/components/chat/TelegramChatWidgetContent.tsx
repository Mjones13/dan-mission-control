'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Loader } from 'lucide-react';
import { LinkifiedText } from './LinkifiedText';
import { TELEGRAM_TEXT_MESSAGE_LIMIT, splitTelegramMessageText } from '@/lib/telegram/message-chunks';
import { useTelegramChatInbox, type TelegramMessage } from './useTelegramChatInbox';
import { useTelegramAgentReadMarkers } from './useTelegramAgentReadMarkers';

interface TelegramChatWidgetContentProps {
  isExpanded: boolean;
}

const CHAT_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function TelegramChatWidgetContent({ isExpanded }: TelegramChatWidgetContentProps) {
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
  const { isMarkedRead, toggleReadMarker } = useTelegramAgentReadMarkers();
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(true);
  const isNearBottomRef = useRef(true);
  const previousChatIdRef = useRef<string | null>(null);
  const trimmedComposerText = composerText.trim();
  const composerChunks = splitTelegramMessageText(trimmedComposerText);
  const composerChunkCount = composerChunks.length;

  useEffect(() => {
    const nextChatId = selectedChat?.id || null;
    const previousChatId = previousChatIdRef.current;
    if (nextChatId && previousChatId !== nextChatId) {
      shouldScrollToBottomRef.current = !selectedCacheEntry?.messages.length;
      isNearBottomRef.current = true;
      setReplyingTo(null);
    }
    previousChatIdRef.current = nextChatId;
  }, [selectedCacheEntry?.messages.length, selectedChat?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !selectedChat) return;

    if (shouldScrollToBottomRef.current || isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    } else if (selectedCacheEntry?.scrollTop !== undefined) {
      el.scrollTop = selectedCacheEntry.scrollTop;
    }
    shouldScrollToBottomRef.current = false;
  }, [messages, selectedCacheEntry?.scrollTop, selectedChat]);

  const handleThreadScroll = () => {
    const el = scrollRef.current;
    if (!el || !selectedChat) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 80;
    setChatScrollTop(selectedChat.id, el.scrollTop);
  };

  const handleLoadOlderMessages = async () => {
    shouldScrollToBottomRef.current = false;
    await loadOlderMessages();
  };

  const handleSendMessage = async () => {
    const followSentMessagesToBottom = isNearBottomRef.current;
    const result = await sendMessage(composerText, replyingTo);
    shouldScrollToBottomRef.current = followSentMessagesToBottom;
    if (followSentMessagesToBottom) isNearBottomRef.current = true;
    if (result.ok) {
      setComposerText('');
      setReplyingTo(null);
    } else {
      setComposerText(result.unsentText);
    }
  };

  const chatList = (
    <div className="flex h-full flex-col">
      {loadingChats ? (
        <div className="flex flex-1 items-center justify-center text-xs text-[#9aa6b2]">
          <Loader className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading chats…
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {chats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => selectChat(chat)}
              className={`relative w-full border-b px-3 py-3 text-left transition-colors hover:bg-mc-bg-tertiary/50 ${selectedChat?.id === chat.id ? 'border-l-[14px] border-l-mc-accent border-b-mc-accent/60 bg-mc-accent/35 shadow-[inset_0_0_0_1px_rgba(88,166,255,0.38)]' : 'border-l-4 border-l-transparent border-b-mc-border/30'}`}
            >
              {selectedChat?.id === chat.id && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-mc-accent shadow-[0_0_8px_rgba(88,166,255,0.9)]" aria-label="Selected chat" />}
              <div className="flex items-center gap-2 pr-3">
                <span className={`min-w-0 flex-1 truncate text-sm font-semibold leading-snug ${selectedChat?.id === chat.id ? 'text-white' : 'text-[#eef2f7]'}`}>{chat.title}</span>
                {chat.unreadCount > 0 && (
                  <span className="rounded-full bg-mc-accent px-1.5 text-[10px] font-bold text-mc-bg">{chat.unreadCount}</span>
                )}
              </div>
              {chat.lastMessagePreview && <p className={`mt-1 truncate text-[10px] leading-tight ${selectedChat?.id === chat.id ? 'text-[#d7e3ef]' : 'text-[#9aa6b2]'}`}>{chat.lastMessagePreview}</p>}
            </button>
          ))}
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
        <div ref={scrollRef} onScroll={handleThreadScroll} className="flex-1 space-y-2 overflow-y-auto p-3">
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
          {messages.map((message) => (
            <div key={message.id} className={message.isOutgoing ? 'ml-6' : 'mr-6'}>
              <div className={`rounded-lg border px-3 py-2.5 ${message.isOutgoing ? 'border-[#4f9ce8]/25 bg-[#234b73]' : 'border-[#314154] bg-[#17212f]'}`}>
                <div className="mb-2 flex items-center gap-3 text-[10px] text-[#aab3bd]">
                  <span>{message.isOutgoing ? 'You' : 'Telegram'}</span>
                  {message.isOutgoing && message.reactionCount > 0 && <span className="text-[#c6d0dc]">✓ acknowledged</span>}
                  <span className="flex-1" />
                  {!message.isOutgoing && selectedChat && (
                    <button
                      type="button"
                      onClick={() => toggleReadMarker(selectedChat.id, message.id)}
                      aria-pressed={isMarkedRead(selectedChat.id, message.id)}
                      className={`rounded-full px-1.5 py-0.5 transition-colors ${isMarkedRead(selectedChat.id, message.id) ? 'bg-mc-accent text-mc-bg shadow-[0_0_8px_rgba(88,166,255,0.35)]' : 'border border-mc-border text-[#9aa6b2] hover:border-mc-accent hover:text-mc-accent'}`}
                      title={isMarkedRead(selectedChat.id, message.id) ? 'Marked read locally' : 'Mark this message read locally'}
                    >
                      {isMarkedRead(selectedChat.id, message.id) ? '✓ read' : 'Mark read'}
                    </button>
                  )}
                  <button onClick={() => setReplyingTo(message)} className="mr-1 hover:text-mc-accent">Reply</button>
                  <span className="text-[#91a0af]">{formatTime(message.sentAt)}</span>
                </div>
                <LinkifiedText className="whitespace-pre-wrap text-sm leading-relaxed text-[#fbfdff]">{message.text}</LinkifiedText>
              </div>
            </div>
          ))}
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
            value={composerText}
            onChange={(event) => setComposerText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSendMessage();
              }
            }}
            rows={1}
            className="min-h-[34px] flex-1 resize-none rounded border border-mc-border bg-[#111923] px-2 py-1.5 text-sm text-[#fbfdff] outline-none placeholder:text-[#7b8794] focus:border-mc-accent"
            placeholder="Message…"
          />
          <button onClick={() => void handleSendMessage()} disabled={sending || !composerText.trim()} className="rounded bg-mc-accent px-3 text-xs font-medium text-mc-bg disabled:opacity-50">
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
    </div>
  );
}
