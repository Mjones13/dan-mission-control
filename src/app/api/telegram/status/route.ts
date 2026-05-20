import { NextResponse } from 'next/server';
import { getTelegramConfigStatus } from '@/lib/telegram/config';
import { getTelegramPollingPolicy } from '@/lib/telegram/policy';
import { hasTelegramSession } from '@/lib/telegram/session-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = getTelegramConfigStatus();
  const sessionExists = config.configured ? hasTelegramSession(config.sessionPath) : false;
  const telegramPolicy = getTelegramPollingPolicy();

  return NextResponse.json({
    available: config.configured,
    configured: config.configured,
    credentials: {
      hasApiId: config.hasApiId,
      hasApiHash: config.hasApiHash,
      apiIdValid: config.apiIdValid,
    },
    session: {
      storage: config.sessionStorage,
      configuredPath: Boolean(config.sessionPath),
      exists: sessionExists,
    },
    telegramPolicy,
    nextStep: !config.configured
      ? 'Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env.local.'
      : sessionExists
        ? 'Telegram session is ready. Next implementation step is chat inbox verification and UI polish.'
        : 'Telegram credentials are configured. Next implementation step is local login/session creation.',
  });
}
