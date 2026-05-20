import { NextRequest, NextResponse } from 'next/server';
import { signInTelegramWithCode, signInTelegramWithPassword } from '@/lib/telegram/auth';
import { toTelegramSafeError } from '@/lib/telegram/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!code && !password) {
    return NextResponse.json({ error: 'code or password is required' }, { status: 400 });
  }

  try {
    const result = password
      ? await signInTelegramWithPassword(password)
      : await signInTelegramWithCode(code);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[Telegram auth] sign-in failed:', error);
    return NextResponse.json({ error: toTelegramSafeError(error) }, { status: 502 });
  }
}
