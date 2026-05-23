'use client';

import { useEffect, useState } from 'react';
import type { DevPreviewMetadataResponse } from '@/lib/dev-preview-metadata';

const DISMISS_STORAGE_PREFIX = 'mission-control-dev-preview-banner-dismissed:';

export default function DevPreviewBanner() {
  const [metadata, setMetadata] = useState<DevPreviewMetadataResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/dev-preview-metadata')
      .then(response => response.json() as Promise<DevPreviewMetadataResponse>)
      .then(data => {
        if (cancelled) return;
        setMetadata(data);

        if (data.enabled) {
          setDismissed(localStorage.getItem(`${DISMISS_STORAGE_PREFIX}${data.id}`) === 'true');
        }
      })
      .catch(() => {
        if (!cancelled) setMetadata({ enabled: false });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!metadata?.enabled || dismissed) return null;

  const previewLabel = metadata.pr ? `PR #${metadata.pr}` : 'Dev preview';
  const primaryText = metadata.summary ?? metadata.title ?? metadata.branch ?? 'Preview metadata enabled';
  const secondaryParts = [metadata.branch, metadata.port ? `:${metadata.port}` : undefined].filter(Boolean);

  const dismiss = () => {
    localStorage.setItem(`${DISMISS_STORAGE_PREFIX}${metadata.id}`, 'true');
    setDismissed(true);
  };

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[60] flex justify-center sm:inset-x-4">
      <aside
        className="pointer-events-auto flex max-w-[min(92vw,760px)] items-center gap-3 rounded-xl border border-mc-accent/40 bg-mc-bg-secondary/95 px-3 py-2 text-xs text-mc-text shadow-2xl shadow-black/30 backdrop-blur md:text-sm"
        aria-label="Dev preview identity"
      >
        {metadata.url ? (
          <a
            href={metadata.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full border border-mc-accent/50 bg-mc-accent/15 px-2 py-1 font-semibold text-mc-accent transition-colors hover:bg-mc-accent/25 focus:outline-none focus:ring-2 focus:ring-mc-accent/70"
          >
            {previewLabel}
          </a>
        ) : (
          <span className="shrink-0 rounded-full border border-mc-accent/50 bg-mc-accent/15 px-2 py-1 font-semibold text-mc-accent">
            {previewLabel}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-mc-text">{primaryText}</div>
          {(metadata.title && metadata.summary) || secondaryParts.length > 0 ? (
            <div className="mt-0.5 truncate text-[11px] text-mc-text-muted">
              {[metadata.title && metadata.summary ? metadata.title : undefined, ...secondaryParts].filter(Boolean).join(' · ')}
            </div>
          ) : null}
          {metadata.bullets.length > 0 ? (
            <div className="mt-1 hidden gap-1 text-[11px] text-mc-text-muted sm:flex">
              {metadata.bullets.map(bullet => (
                <span key={bullet} className="truncate rounded-md bg-mc-bg/80 px-1.5 py-0.5">
                  {bullet}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md px-2 py-1 text-mc-text-muted transition-colors hover:bg-mc-bg hover:text-mc-text focus:outline-none focus:ring-2 focus:ring-mc-accent/70"
          aria-label="Dismiss dev preview banner"
        >
          ×
        </button>
      </aside>
    </div>
  );
}
