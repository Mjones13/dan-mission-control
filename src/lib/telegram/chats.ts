import { Api } from 'telegram';
import { isTelegramBridgeStatusMessage } from './bridge-status';
import { createTelegramClient } from './client';

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
  client: ReturnType<typeof createTelegramClient>,
  dialog: Awaited<ReturnType<ReturnType<typeof createTelegramClient>['getDialogs']>>[number],
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

  const maxBridgeMessageId = Math.max(...bridgeMessageIds);
  await client.markAsRead(dialog.inputEntity, undefined, { maxId: maxBridgeMessageId });
  return bridgeMessageIds.length;
}

export async function listTelegramGroupChats(limit = 50): Promise<TelegramGroupChatSummary[]> {
  const client = createTelegramClient();
  await client.connect();

  try {
    const authorized = await client.checkAuthorization();
    if (!authorized) {
      throw new Error('TELEGRAM_SESSION_REQUIRED');
    }

    const dialogs = await client.getDialogs({ limit });

    const summaries = await Promise.all(dialogs
      .filter((dialog) => dialog.isGroup)
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
  } finally {
    await client.disconnect();
  }
}
