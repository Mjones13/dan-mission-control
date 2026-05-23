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
  const headerTitle = metadata.title && metadata.summary ? metadata.title : undefined;
  const secondaryParts = [metadata.branch, metadata.port ? `:${metadata.port}` : undefined].filter(Boolean);

  const dismiss = () => {
    localStorage.setItem(`${DISMISS_STORAGE_PREFIX}${metadata.id}`, 'true');
    setDismissed(true);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60]">
      <aside
        className="pointer-events-auto w-full border-t border-mc-accent/40 bg-mc-bg-secondary/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] text-[15px] text-mc-text shadow-[0_-18px_45px_rgba(0,0,0,0.35)] backdrop-blur md:px-6 md:text-[17px]"
        aria-label="Dev preview identity"
      >
        <div className="mx-auto flex max-w-5xl items-start justify-center gap-3">
          {metadata.url ? (
            <a
              href={metadata.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-full border border-mc-accent/50 bg-mc-accent/15 px-2.5 py-1 font-semibold text-mc-accent transition-colors hover:bg-mc-accent/25 focus:outline-none focus:ring-2 focus:ring-mc-accent/70"
            >
              {previewLabel}
            </a>
          ) : (
            <span className="shrink-0 rounded-full border border-mc-accent/50 bg-mc-accent/15 px-2.5 py-1 font-semibold text-mc-accent">
              {previewLabel}
            </span>
          )}

          <div className="min-w-0 max-w-4xl flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {headerTitle ? (
                <span className="font-semibold text-mc-text">{headerTitle}</span>
              ) : null}
              {secondaryParts.length > 0 ? (
                <span className="font-mono text-[14px] text-mc-text-muted">
                  {secondaryParts.join(' · ')}
                </span>
              ) : null}
            </div>
            <p className="max-w-5xl leading-relaxed text-mc-text">{primaryText}</p>
            {metadata.bullets.length > 0 ? (
              <ul className="max-w-5xl space-y-1 text-[14px] leading-relaxed text-mc-text-muted">
                {metadata.bullets.map(bullet => (
                  <li key={bullet} className="rounded-md bg-mc-bg/70 py-1">
                    • {bullet}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 rounded-md px-2 py-1 text-[21px] leading-none text-mc-text-muted transition-colors hover:bg-mc-bg hover:text-mc-text focus:outline-none focus:ring-2 focus:ring-mc-accent/70"
            aria-label="Dismiss dev preview banner"
          >
            ×
          </button>
        </div>
      </aside>
    </div>
  );
}
