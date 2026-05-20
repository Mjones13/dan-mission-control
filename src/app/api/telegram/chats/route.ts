import { NextRequest, NextResponse } from 'next/server';
import { listTelegramGroupChats } from '@/lib/telegram/chats';
import { toTelegramSafeError } from '@/lib/telegram/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get('limit') || '50');
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;

  try {
    const chats = await listTelegramGroupChats(limit);
    return NextResponse.json({ chats });
  } catch (error) {
    if (error instanceof Error && error.message === 'TELEGRAM_SESSION_REQUIRED') {
      return NextResponse.json({ error: 'Telegram login is required before listing chats.' }, { status: 401 });
    }

    console.error('[Telegram chats] list failed:', error);
    return NextResponse.json({ error: toTelegramSafeError(error) }, { status: 502 });
  }
}
