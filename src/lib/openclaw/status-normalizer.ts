import type { OpenClawSessionInfo } from '../types';

export const DEFAULT_OPENCLAW_GATEWAY_URL = 'ws://127.0.0.1:18789';

export type OpenClawGatewayErrorKind =
  | 'unavailable'
  | 'unauthenticated'
  | 'timeout'
  | 'unknown';

export interface NormalizedOpenClawGatewayStatus {
  available: boolean;
  authenticated: boolean;
  error: string | null;
  errorKind: OpenClawGatewayErrorKind | null;
  details: {
    gatewayUrl: string;
    sessionsCount?: number;
    checkedAt: string;
  };
}

export interface NormalizedOpenClawSessionsResponse {
  sessions: OpenClawSessionInfo[];
  gateway: NormalizedOpenClawGatewayStatus;
  empty: boolean;
}

function safeGatewayUrl(url = process.env.OPENCLAW_GATEWAY_URL || DEFAULT_OPENCLAW_GATEWAY_URL): string {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    parsed.searchParams.delete('token');
    return parsed.toString();
  } catch {
    return DEFAULT_OPENCLAW_GATEWAY_URL;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'Unknown OpenClaw Gateway error';
}

export function classifyGatewayError(error: unknown): OpenClawGatewayErrorKind {
  const message = errorMessage(error).toLowerCase();

  if (message.includes('auth') || message.includes('token') || message.includes('unauthorized') || message.includes('forbidden')) {
    return 'unauthenticated';
  }

  if (message.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }

  if (
    message.includes('connect') ||
    message.includes('connection') ||
    message.includes('refused') ||
    message.includes('econnrefused') ||
    message.includes('not connected') ||
    message.includes('websocket') ||
    message.includes('gateway')
  ) {
    return 'unavailable';
  }

  return 'unknown';
}

interface NormalizeGatewayStatusInput {
  available?: boolean;
  authenticated?: boolean;
  sessions?: OpenClawSessionInfo[];
  error?: unknown;
  checkedAt?: string;
  gatewayUrl?: string;
}

export function normalizeGatewayStatus(input: NormalizeGatewayStatusInput = {}): NormalizedOpenClawGatewayStatus {
  const hasError = input.error !== undefined && input.error !== null;
  const errorKind = hasError ? classifyGatewayError(input.error) : null;
  const available = input.available ?? !hasError;
  const authenticated = input.authenticated ?? (available && !hasError);

  return {
    available,
    authenticated,
    error: hasError ? errorMessage(input.error) : null,
    errorKind,
    details: {
      gatewayUrl: safeGatewayUrl(input.gatewayUrl),
      sessionsCount: input.sessions?.length,
      checkedAt: input.checkedAt ?? new Date().toISOString(),
    },
  };
}

export function normalizeGatewaySessions(
  sessions: OpenClawSessionInfo[],
  input: Omit<NormalizeGatewayStatusInput, 'sessions'> = {}
): NormalizedOpenClawSessionsResponse {
  return {
    sessions,
    gateway: normalizeGatewayStatus({ ...input, sessions }),
    empty: sessions.length === 0,
  };
}

export function normalizeGatewayFailure(error: unknown, checkedAt?: string): NormalizedOpenClawGatewayStatus {
  const errorKind = classifyGatewayError(error);
  return normalizeGatewayStatus({
    available: false,
    authenticated: errorKind !== 'unauthenticated' ? false : false,
    error,
    checkedAt,
  });
}
