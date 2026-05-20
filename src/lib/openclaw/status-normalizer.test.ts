import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyGatewayError,
  normalizeGatewayFailure,
  normalizeGatewaySessions,
  normalizeGatewayStatus,
} from './status-normalizer';

test('normalizes online authenticated gateway status without exposing token query params', () => {
  const status = normalizeGatewayStatus({
    available: true,
    authenticated: true,
    sessions: [{ id: 'session-1', channel: 'telegram', status: 'active' }],
    checkedAt: '2026-05-19T06:00:00.000Z',
    gatewayUrl: 'ws://127.0.0.1:18789?token=secret-token',
  });

  assert.equal(status.available, true);
  assert.equal(status.authenticated, true);
  assert.equal(status.error, null);
  assert.equal(status.errorKind, null);
  assert.equal(status.details.sessionsCount, 1);
  assert.equal(status.details.gatewayUrl.includes('secret-token'), false);
  assert.equal(status.details.gatewayUrl.includes('token='), false);
});

test('normalizes offline gateway failures as safe unavailable status', () => {
  const status = normalizeGatewayFailure(new Error('Failed to connect to OpenClaw Gateway'), '2026-05-19T06:00:00.000Z');

  assert.equal(status.available, false);
  assert.equal(status.authenticated, false);
  assert.equal(status.errorKind, 'unavailable');
  assert.match(status.error || '', /Failed to connect/);
  assert.equal(status.details.checkedAt, '2026-05-19T06:00:00.000Z');
});

test('classifies authentication and timeout failures distinctly', () => {
  assert.equal(classifyGatewayError(new Error('Authentication failed: invalid token')), 'unauthenticated');
  assert.equal(classifyGatewayError(new Error('Request timeout: sessions.list')), 'timeout');
});

test('normalizes empty session lists separately from unavailable gateway', () => {
  const response = normalizeGatewaySessions([], {
    available: true,
    authenticated: true,
    checkedAt: '2026-05-19T06:00:00.000Z',
  });

  assert.deepEqual(response.sessions, []);
  assert.equal(response.empty, true);
  assert.equal(response.gateway.available, true);
  assert.equal(response.gateway.authenticated, true);
  assert.equal(response.gateway.details.sessionsCount, 0);
});
