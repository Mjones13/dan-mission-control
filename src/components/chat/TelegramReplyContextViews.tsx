'use client';

import type { ReactNode } from 'react';
import { Loader, X } from 'lucide-react';
import { LinkifiedText } from './LinkifiedText';
import type { TelegramMessage } from './useTelegramChatInbox';
import { telegramDisplaySenderLabel, type TelegramReplyContextMessage } from './telegramReplyContext';

function formatTime(value: string): string {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

interface ReplyPreviewProps {
  preview: TelegramReplyContextMessage;
  compact?: boolean;
  onOpenThread?: () => void;
}

export function TelegramInlineReplyPreview({ preview, compact = false, onOpenThread }: ReplyPreviewProps) {
  const previewClassName = `mb-2 flex w-full items-center gap-2 border-l-2 border-mc-accent/80 bg-black/15 px-2 py-1.5 text-left ${compact ? 'rounded text-[10px]' : 'rounded-md text-[11px]'}`;
  const previewContent = <span className="min-w-0 flex-1 truncate text-[#cbd6e2]">{preview.text}</span>;

  if (onOpenThread) {
    return (
      <button type="button" onClick={onOpenThread} className={`${previewClassName} transition-colors hover:border-mc-accent hover:bg-mc-accent/10`} aria-label="Open thread">
        {previewContent}
      </button>
    );
  }

  return (
    <div className={previewClassName}>
      {previewContent}
    </div>
  );
}

interface MessageBubbleProps {
  message: TelegramMessage;
  preview?: TelegramReplyContextMessage;
  compact?: boolean;
  showReadMarker?: boolean;
  readMarked?: boolean;
  readMarkerNode?: ReactNode;
  childNavigationNode?: ReactNode;
  onToggleRead?: () => void;
  onReply(message: TelegramMessage): void;
  onOpenThread?(message: TelegramMessage): void;
  canOpenThread?: boolean;
  chatTitle?: string;
}

export function TelegramMessageBubble({
  message,
  preview,
  compact = false,
  showReadMarker = false,
  readMarked = false,
  readMarkerNode,
  childNavigationNode,
  onToggleRead,
  onReply,
  onOpenThread,
  canOpenThread = false,
  chatTitle,
}: MessageBubbleProps) {
  const senderLabel = telegramDisplaySenderLabel(message, chatTitle);

  return (
    <div className={message.isOutgoing ? (compact ? 'ml-6' : 'ml-8') : (compact ? 'mr-6' : 'mr-8')}>
      <div className={`rounded-lg border ${compact ? 'px-3 py-2.5' : 'px-3.5 py-2.5'} ${message.isOutgoing ? 'border-[#4f9ce8]/25 bg-[#234b73]' : 'border-[#314154] bg-[#17212f]'}`}>
        <div className="mb-2 flex items-center gap-3 text-[10px] text-[#aab3bd]">
          {senderLabel && <span>{senderLabel}</span>}
          {message.isOutgoing && message.reactionCount > 0 && <span className="text-[#c6d0dc]">✓ ack</span>}
          <span className="flex-1" />
          <button onClick={() => onReply(message)} className="hover:text-mc-accent">Reply</button>
          <span className="text-[#91a0af]">{formatTime(message.sentAt)}</span>
        </div>
        {preview && <TelegramInlineReplyPreview preview={preview} compact={compact} onOpenThread={canOpenThread && onOpenThread ? () => onOpenThread(message) : undefined} />}
        <LinkifiedText className="whitespace-pre-wrap text-sm leading-relaxed text-[#fbfdff]">{message.text}</LinkifiedText>
        {(showReadMarker || childNavigationNode) && (
          <div className="mt-2 flex justify-end">
            <div className="flex items-center gap-1">
              {childNavigationNode}
              {showReadMarker && (readMarkerNode || (onToggleRead && (
                <button
                  type="button"
                  onClick={onToggleRead}
                  aria-label={readMarked ? 'Marked read locally' : 'Mark this message read locally'}
                  aria-pressed={readMarked}
                  className={`flex ${compact ? 'h-5 w-5 text-xs' : 'h-6 w-6 text-sm'} items-center justify-center rounded-full border leading-none transition-colors ${readMarked ? 'border-mc-accent bg-mc-accent text-mc-bg shadow-[0_0_8px_rgba(88,166,255,0.35)]' : 'border-mc-border text-transparent hover:border-mc-accent hover:text-mc-accent'}`}
                  title={readMarked ? 'Marked read locally' : 'Mark this message read locally'}
                >
                  {readMarked ? '✓' : ''}
                </button>
              )))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ThreadModalProps {
  open: boolean;
  title: string;
  messages: TelegramReplyContextMessage[];
  loading: boolean;
  loadingEarlier: boolean;
  hasEarlier: boolean;
  error: string | null;
  onClose(): void;
  onLoadEarlier(): void;
  onReply(message: TelegramReplyContextMessage): void;
  chatTitle?: string;
}

export function TelegramReplyContextModal({
  open,
  messages,
  loading,
  loadingEarlier,
  hasEarlier,
  error,
  onClose,
  onLoadEarlier,
  onReply,
  chatTitle,
}: ThreadModalProps) {
  if (!open) return null;

  return (
    // The overlay intentionally stops above the shared composer. That keeps the
    // context modal readable while still letting M Jones focus/type in the main
    // composer without dismissing the modal.
    <div className="pointer-events-none fixed inset-x-0 top-0 bottom-[6.5rem] z-50 flex items-center justify-center p-3 md:bottom-[7rem] md:p-6">
      <button
        type="button"
        aria-label="Close reply context"
        className="pointer-events-auto absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <section className="pointer-events-auto relative flex h-[min(90vh,calc(100%-0.75rem))] w-[92vw] max-w-[78rem] flex-col overflow-hidden rounded-2xl border border-mc-border bg-mc-bg-secondary shadow-2xl shadow-black/50 md:h-[min(86vh,calc(100%-1.5rem))] md:w-[82vw]">
        <header className="flex items-center gap-3 border-b border-mc-border px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-[#f5f7fb]">Thread</h2>
          <button onClick={onClose} className="rounded p-1 text-[#9aa6b2] hover:bg-mc-bg-tertiary hover:text-white" aria-label="Close reply context">
            <X className="h-4 w-4" />
          </button>
        </header>
        {error && <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-300">{error}</div>}
        <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
          {hasEarlier && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onLoadEarlier}
                disabled={loadingEarlier}
                className="rounded-full border border-mc-border px-3 py-1 text-[10px] text-[#9aa6b2] transition-colors hover:border-mc-accent hover:text-mc-accent disabled:opacity-50"
              >
                {loadingEarlier ? 'Loading…' : 'Load earlier in chain'}
              </button>
            </div>
          )}
          {loading && (
            <div className="flex items-center justify-center py-8 text-xs text-[#9aa6b2]">
              <Loader className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading reply context…
            </div>
          )}
          {messages.map((message) => {
            const displayLabel = message.status === 'loaded' ? telegramDisplaySenderLabel(message, chatTitle) : 'Original message';

            return (
              <div key={`${message.id}-${message.status}`} className={message.isOutgoing ? 'ml-8' : 'mr-8'}>
                <div className={`rounded-lg border px-3.5 py-2.5 ${message.status === 'loaded' ? (message.isOutgoing ? 'border-[#4f9ce8]/25 bg-[#234b73]' : 'border-[#314154] bg-[#17212f]') : 'border-dashed border-mc-border bg-mc-bg/70'}`}>
                  <div className="mb-2 flex items-center gap-3 text-[10px] text-[#aab3bd]">
                    {displayLabel && <span>{displayLabel}</span>}
                    {message.status === 'loaded' && message.isOutgoing && message.reactionCount > 0 && <span className="text-[#c6d0dc]">✓ ack</span>}
                    {message.status !== 'loaded' && <span className="text-[#91a0af]">{message.status === 'non_text' ? 'non-text' : 'unavailable'}</span>}
                    <span className="flex-1" />
                    {message.status === 'loaded' && <button onClick={() => onReply(message)} className="hover:text-mc-accent">Reply</button>}
                    <span className="text-[#91a0af]">{formatTime(message.sentAt)}</span>
                  </div>
                  <LinkifiedText className="whitespace-pre-wrap text-sm leading-relaxed text-[#fbfdff]">{message.text}</LinkifiedText>
                </div>
              </div>
            );
          })}
        </div>
        <footer className="border-t border-mc-border px-4 py-2 text-[11px] text-[#9aa6b2]">
          Replying here uses the main composer below; the context stays open while you type.
        </footer>
      </section>
    </div>
  );
}
