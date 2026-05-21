import { Api } from 'telegram';
import type { TelegramClient } from 'telegram';
import { isTelegramBridgeStatusMessage } from './bridge-status';
import { withTelegramClient } from './client-manager';
import { getGroupDialogsCached, type TelegramDialog } from './dialog-cache';

export interface TelegramGroupChatSummary {
  id: string;
  title: string;
  unreadCount: number;
  isGroup: boolean;
  isChannel: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

async function clearUnreadBridgeStatusMessages(
  client: TelegramClient,
  dialog: TelegramDialog,
): Promise<number> {
  const unreadCount = dialog.unreadCount || 0;
  if (unreadCount <= 0 || !dialog.inputEntity) return 0;

  const messages = await client.getMessages(dialog.inputEntity, {
    limit: Math.min(Math.max(unreadCount, 1), 10),
  });

  const bridgeMessageIds = messages
    .filter((message): message is Api.Message => message instanceof Api.Message)
    .filter((message) => isTelegramBridgeStatusMessage(message.message || null))
    .map((message) => message.id);

  if (bridgeMessageIds.length === 0) return 0;

  // Telegram marks every unread message up to maxId as read. Use the newest
  // matching bridge/status message so stale progress updates stop inflating
  // Mission Control's unread badge without changing the shared classifier.
  const maxBridgeMessageId = Math.max(...bridgeMessageIds);
  await client.markAsRead(dialog.inputEntity, undefined, { maxId: maxBridgeMessageId });
  return bridgeMessageIds.length;
}

export async function listTelegramGroupChats(limit = 50): Promise<TelegramGroupChatSummary[]> {
  return withTelegramClient(
    { operation: 'telegram.chats.list', priority: 'background' },
    async (client) => {
      const dialogs = await getGroupDialogsCached(client, { limit, maxAgeMs: 1_000 });

      const summaries = await Promise.all(dialogs
        .map(async (dialog) => {
          const lastMessagePreview = dialog.message && 'message' in dialog.message && typeof dialog.message.message === 'string'
            ? dialog.message.message
            : null;
          const clearedBridgeCount = await clearUnreadBridgeStatusMessages(client, dialog).catch(() => 0);

          return {
            id: dialog.id?.toString() || '',
            title: dialog.title || dialog.name || 'Untitled group',
            unreadCount: Math.max((dialog.unreadCount || 0) - clearedBridgeCount, 0),
            isGroup: dialog.isGroup,
            isChannel: dialog.isChannel,
            lastMessageAt: dialog.date ? new Date(dialog.date * 1000).toISOString() : null,
            lastMessagePreview,
          };
        }));

      return summaries.filter((chat) => chat.id.length > 0);
    },
  );
}
