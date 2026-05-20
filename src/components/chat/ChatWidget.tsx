'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { MessageSquare, X, Minimize2, Maximize2, Inbox } from 'lucide-react';
import {
  DEFAULT_TELEGRAM_POLLING_POLICY,
  isTelegramPollIntervalEnabled,
  type TelegramPollingPolicy,
} from '@/lib/telegram/policy';
import { TelegramChatWidgetContent } from './TelegramChatWidgetContent';

export interface UnreadTask {
  task_id: string;
  task_title: string;
  task_status: string;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_role: string | null;
  assigned_agent_name: string | null;
  assigned_agent_emoji: string | null;
}

interface TelegramChatSummary {
  unreadCount: number;
}


export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [totalUnread, setTotalUnread] = useState(0);
  const [telegramPolicy, setTelegramPolicy] = useState<TelegramPollingPolicy>(DEFAULT_TELEGRAM_POLLING_POLICY);
  const telegramPolicyRef = useRef<TelegramPollingPolicy>(DEFAULT_TELEGRAM_POLLING_POLICY);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { telegramPolicyRef.current = telegramPolicy; }, [telegramPolicy]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/telegram/status')
      .then(async (res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load Telegram status'))))
      .then((data: { telegramPolicy?: TelegramPollingPolicy }) => {
        if (!cancelled) setTelegramPolicy(data.telegramPolicy || DEFAULT_TELEGRAM_POLLING_POLICY);
      })
      .catch(() => {
        if (!cancelled) setTelegramPolicy(DEFAULT_TELEGRAM_POLLING_POLICY);
      });
    return () => { cancelled = true; };
  }, []);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/telegram/chats?limit=100');
      if (res.ok) {
        const data: { chats?: TelegramChatSummary[] } = await res.json();
        setTotalUnread((data.chats || []).reduce((sum, chat) => sum + chat.unreadCount, 0));
      }
    } catch {
      // Silent — will retry
    }
  }, []);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (isOpen) return;

    fetchUnread();
    if (isTelegramPollIntervalEnabled(telegramPolicy, telegramPolicy.badgePollMs)) {
      pollRef.current = setInterval(() => {
        const currentPolicy = telegramPolicyRef.current;
        if (currentPolicy.pollWhenHidden || !document.hidden) void fetchUnread();
      }, telegramPolicy.badgePollMs);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchUnread, isOpen, telegramPolicy]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+C to toggle chat
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Listen for chat:toggle custom event (from CommandPalette)
  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    window.addEventListener('chat:toggle', handleToggle);
    return () => window.removeEventListener('chat:toggle', handleToggle);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
  };

  const widthClass = isExpanded ? 'w-[950px]' : 'w-[475px]';
  const heightClass = isExpanded ? 'h-[790px]' : 'h-[530px]';

  return (
    <>
      {/* Floating Chat Bubble */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-[45] w-14 h-14 bg-mc-accent rounded-full shadow-lg shadow-mc-accent/20 flex items-center justify-center hover:bg-mc-accent/90 transition-all hover:scale-105 group"
          title="Open Chat (⌘⇧C)"
        >
          <MessageSquare className="w-6 h-6 text-mc-bg" />
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-mc-accent-red text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div
          className={`fixed bottom-5 right-5 z-[45] ${widthClass} ${heightClass} max-h-[85vh] max-w-[95vw] bg-mc-bg-secondary border border-mc-border rounded-xl shadow-2xl shadow-black/40 flex flex-col overflow-hidden transition-all duration-200`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-mc-border bg-mc-bg-secondary flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  href="/chat-inbox"
                  className="flex items-center gap-2 rounded-sm hover:text-mc-accent transition-colors"
                  title="Open full Chat Inbox"
                >
                  <Inbox className="w-4 h-4 text-mc-accent" />
                  <span className="text-sm font-medium">Chat Inbox</span>
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 hover:bg-mc-bg-tertiary rounded transition-colors"
                title={isExpanded ? 'Compact' : 'Expand'}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={handleClose}
                className="p-1.5 hover:bg-mc-bg-tertiary rounded transition-colors"
                title="Close (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            <TelegramChatWidgetContent isExpanded={isExpanded} />
          </div>

          {/* Footer hint */}
          <div className="px-3 py-1.5 border-t border-mc-border/50 bg-mc-bg flex-shrink-0">
            <span className="text-[10px] text-mc-text-secondary/50">
              ⌘⇧C toggle · Esc close · ⌘K commands · @ mention agents
            </span>
          </div>
        </div>
      )}
    </>
  );
}
