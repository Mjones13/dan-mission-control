import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramLoginCode } from '@/lib/telegram/auth';
import { toTelegramSafeError } from '@/lib/telegram/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';

  if (!phoneNumber) {
    return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 });
  }

  try {
    const result = await sendTelegramLoginCode(phoneNumber);
    return NextResponse.json({ ok: true, isCodeViaApp: result.isCodeViaApp });
  } catch (error) {
    console.error('[Telegram auth] send-code failed:', error);
    return NextResponse.json({ error: toTelegramSafeError(error) }, { status: 502 });
  }
}
