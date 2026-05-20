import { NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { normalizeGatewayFailure, normalizeGatewayStatus } from '@/lib/openclaw/status-normalizer';

export const dynamic = 'force-dynamic';

// GET /api/openclaw/status - Check OpenClaw connection status
export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    const client = getOpenClawClient();

    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch (error) {
        return NextResponse.json(normalizeGatewayFailure(error, checkedAt));
      }
    }

    try {
      const sessions = await client.listSessions();
      return NextResponse.json(normalizeGatewayStatus({
        available: true,
        authenticated: true,
        sessions,
        checkedAt,
      }));
    } catch (error) {
      return NextResponse.json(normalizeGatewayStatus({
        available: true,
        authenticated: false,
        error,
        checkedAt,
      }));
    }
  } catch (error) {
    console.error('OpenClaw status check failed:', error);
    return NextResponse.json(normalizeGatewayFailure(error, checkedAt));
  }
}
