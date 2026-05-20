import { NextRequest, NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { queryAll } from '@/lib/db';
import { normalizeGatewaySessions } from '@/lib/openclaw/status-normalizer';
import type { OpenClawSession } from '@/lib/types';

export const dynamic = 'force-dynamic';
// GET /api/openclaw/sessions - List OpenClaw sessions
export async function GET(request: NextRequest) {
  const checkedAt = new Date().toISOString();

  try {
    const { searchParams } = new URL(request.url);
    const sessionType = searchParams.get('session_type');
    const status = searchParams.get('status');

    // If filtering by database fields, query the database
    if (sessionType || status) {
      let sql = 'SELECT * FROM openclaw_sessions WHERE 1=1';
      const params: unknown[] = [];

      if (sessionType) {
        sql += ' AND session_type = ?';
        params.push(sessionType);
      }

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      sql += ' ORDER BY created_at DESC';

      const sessions = queryAll<OpenClawSession>(sql, params);
      return NextResponse.json(sessions);
    }

    // Otherwise, query OpenClaw Gateway for live sessions
    const client = getOpenClawClient();

    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch (error) {
        return NextResponse.json({
          ...normalizeGatewaySessions([], {
            available: false,
            authenticated: false,
            error,
            checkedAt,
          }),
          unavailable: true,
        });
      }
    }

    try {
      const sessions = await client.listSessions();
      return NextResponse.json(normalizeGatewaySessions(sessions, {
        available: true,
        authenticated: true,
        checkedAt,
      }));
    } catch (error) {
      return NextResponse.json({
        ...normalizeGatewaySessions([], {
          available: true,
          authenticated: false,
          error,
          checkedAt,
        }),
        unavailable: false,
      });
    }
  } catch (error) {
    console.error('Failed to list OpenClaw sessions:', error);
    return NextResponse.json({
      ...normalizeGatewaySessions([], {
        available: false,
        authenticated: false,
        error,
        checkedAt,
      }),
      unavailable: true,
    });
  }
}

// POST /api/openclaw/sessions - Create a new OpenClaw session
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channel, peer } = body;

    if (!channel) {
      return NextResponse.json(
        { error: 'channel is required' },
        { status: 400 }
      );
    }

    const client = getOpenClawClient();

    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch {
        return NextResponse.json(
          { error: 'Failed to connect to OpenClaw Gateway' },
          { status: 503 }
        );
      }
    }

    const session = await client.createSession(channel, peer);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error('Failed to create OpenClaw session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
