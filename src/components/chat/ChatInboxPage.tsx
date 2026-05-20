'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, Inbox } from 'lucide-react';
import { ChatConversation } from './ChatConversation';
import { ChatInbox } from './ChatInbox';
import type { UnreadTask } from './ChatWidget';

export function ChatInboxPage() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskTitle, setSelectedTaskTitle] = useState('');
  const [unreadTasks, setUnreadTasks] = useState<UnreadTask[]>([]);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks/unread');
      if (res.ok) {
        setUnreadTasks(await res.json());
      }
    } catch {
      // Silent — will retry.
    }
  }, []);

  useEffect(() => {
    fetchUnread();
    pollRef.current = setInterval(fetchUnread, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchUnread]);

  const handleSelectTask = (taskId: string, title: string) => {
    setSelectedTaskId(taskId);
    setSelectedTaskTitle(title);
    fetch(`/api/tasks/${taskId}/read`, { method: 'POST' }).catch(() => {});
  };

  const handleBack = () => {
    setSelectedTaskId(null);
    fetchUnread();
  };

  return (
    <main className="min-h-screen bg-mc-bg text-mc-text p-4 md:p-6">
      <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-7xl flex-col overflow-hidden rounded-2xl border border-mc-border bg-mc-bg-secondary shadow-2xl shadow-black/30 md:h-[calc(100vh-3rem)]">
        <header className="flex items-center gap-3 border-b border-mc-border px-4 py-3">
          {selectedTaskId && (
            <button
              onClick={handleBack}
              className="rounded p-1.5 transition-colors hover:bg-mc-bg-tertiary md:hidden"
              title="Back to inbox"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <Inbox className="h-5 w-5 text-mc-accent" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">
              {selectedTaskId ? selectedTaskTitle : 'Chat Inbox'}
            </h1>
            <p className="text-xs text-mc-text-secondary">
              {selectedTaskId ? 'Conversation' : `${unreadTasks.length} conversation${unreadTasks.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className={`${selectedTaskId ? 'hidden md:flex' : 'flex'} w-full flex-col border-r border-mc-border md:w-[360px]`}>
            <ChatInbox tasks={unreadTasks} onSelectTask={handleSelectTask} />
          </aside>

          <section className={`${selectedTaskId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
            {selectedTaskId ? (
              <ChatConversation
                taskId={selectedTaskId}
                onMarkRead={() => {
                  fetch(`/api/tasks/${selectedTaskId}/read`, { method: 'POST' }).catch(() => {});
                }}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-mc-text-secondary">
                Select a conversation from the inbox.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
