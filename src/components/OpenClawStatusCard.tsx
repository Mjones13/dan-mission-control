'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RadioTower } from 'lucide-react';
import type { NormalizedOpenClawGatewayStatus } from '@/lib/openclaw/status-normalizer';

type StatusState = NormalizedOpenClawGatewayStatus | null;

function statusLabel(status: NormalizedOpenClawGatewayStatus): string {
  if (status.available && status.authenticated) return 'Gateway online';
  if (status.available && !status.authenticated) return 'Gateway reachable, auth limited';
  if (status.errorKind === 'unauthenticated') return 'Gateway auth needed';
  return 'Gateway offline';
}

function statusDescription(status: NormalizedOpenClawGatewayStatus): string {
  if (status.available && status.authenticated) {
    const count = status.details.sessionsCount ?? 0;
    return `${count} live session${count === 1 ? '' : 's'} reported by OpenClaw.`;
  }

  if (status.errorKind === 'timeout') {
    return 'Mission Control reached for OpenClaw but the request timed out. Local queues remain usable.';
  }

  if (status.errorKind === 'unauthenticated') {
    return 'Mission Control did not authenticate with the local Gateway. Check pairing/token setup before using live sessions.';
  }

  return 'Mission Control is running without a live Gateway connection. Local workspaces and queues remain available.';
}

export function OpenClawStatusCard() {
  const [status, setStatus] = useState<StatusState>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const res = await fetch('/api/openclaw/status');
        const data = await res.json();
        if (!cancelled) setStatus(data as NormalizedOpenClawGatewayStatus);
      } catch {
        if (!cancelled) {
          setStatus({
            available: false,
            authenticated: false,
            error: 'Mission Control could not read OpenClaw status.',
            errorKind: 'unknown',
            details: {
              gatewayUrl: 'ws://127.0.0.1:18789',
              checkedAt: new Date().toISOString(),
            },
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadStatus();
    const interval = setInterval(loadStatus, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const isHealthy = !!status?.available && status.authenticated;

  return (
    <section className="mb-6 rounded-xl border border-mc-border bg-mc-bg-secondary p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 rounded-lg p-2 ${isHealthy ? 'bg-mc-accent-green/15 text-mc-accent-green' : 'bg-amber-500/15 text-amber-300'}`}>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isHealthy ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : status?.errorKind === 'unavailable' ? (
            <RadioTower className="h-5 w-5" />
          ) : (
            <AlertTriangle className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">OpenClaw Gateway</h2>
            {status && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isHealthy ? 'bg-mc-accent-green/15 text-mc-accent-green' : 'bg-amber-500/15 text-amber-300'}`}>
                {statusLabel(status)}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-mc-text-secondary">
            {loading || !status ? 'Checking local Gateway status…' : statusDescription(status)}
          </p>
          {status && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mc-text-secondary">
              <span>Gateway: <span className="font-mono text-mc-text">{status.details.gatewayUrl}</span></span>
              <span>Checked: {new Date(status.details.checkedAt).toLocaleTimeString()}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
