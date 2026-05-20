import { NextRequest, NextResponse } from 'next/server';
import { listTelegramGroupChatMessages, markTelegramGroupChatRead, resolveTelegramGroupChatMessages, sendTelegramGroupChatMessage } from '@/lib/telegram/messages';
import { toTelegramSafeError } from '@/lib/telegram/errors';
import { parseTelegramMessagesQuery } from './params';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: {
    chatId: string;
  };
}

function handleTelegramMessageError(error: unknown) {
  if (error instanceof Error && error.message === 'TELEGRAM_SESSION_REQUIRED') {
    return NextResponse.json({ error: 'Telegram login is required before listing messages.' }, { status: 401 });
  }
  if (error instanceof Error && error.message === 'TELEGRAM_GROUP_CHAT_NOT_FOUND') {
    return NextResponse.json({ error: 'Telegram group chat not found or not allowed.' }, { status: 404 });
  }
  if (error instanceof Error && error.message === 'TELEGRAM_EMPTY_MESSAGE') {
    return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  }
  if (error instanceof Error && error.message === 'TELEGRAM_MESSAGE_TOO_LONG') {
    return NextResponse.json({ error: 'Telegram messages must be 4096 characters or fewer.' }, { status: 400 });
  }

  console.error('[Telegram messages] request failed:', error);
  return NextResponse.json({ error: toTelegramSafeError(error) }, { status: 502 });
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { searchParams } = new URL(request.url);
  const query = parseTelegramMessagesQuery(searchParams);
  if ('error' in query) {
    return NextResponse.json({ error: query.error }, { status: 400 });
  }

  try {
    const messages = query.ids
      ? await resolveTelegramGroupChatMessages(params.chatId, query.ids)
      : await listTelegramGroupChatMessages(params.chatId, query);
    return NextResponse.json({ messages });
  } catch (error) {
    return handleTelegramMessageError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text : '';
  const replyToMessageId = Number.isInteger(body.replyToMessageId) ? body.replyToMessageId : undefined;

  try {
    const message = await sendTelegramGroupChatMessage(params.chatId, text, replyToMessageId);
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return handleTelegramMessageError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const body = await request.json().catch(() => ({}));
  const maxMessageId = Number.isInteger(body.maxMessageId) ? body.maxMessageId : undefined;

  try {
    await markTelegramGroupChatRead(params.chatId, maxMessageId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleTelegramMessageError(error);
  }
}
