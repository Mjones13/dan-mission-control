export type DevPreviewMetadata = {
  enabled: true;
  id: string;
  pr?: number;
  branch?: string;
  title?: string;
  summary?: string;
  bullets: string[];
  url?: string;
  port?: string;
};

export type DevPreviewMetadataResponse =
  | { enabled: false }
  | DevPreviewMetadata;

type EnvLike = Record<string, string | undefined>;

const LIMITS = {
  id: 96,
  branch: 120,
  title: 120,
  summary: 720,
  bullet: 280,
  port: 12,
};

const MAX_BULLETS = 4;

function normalizeString(value: string | undefined, maxLength: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

function normalizePr(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const numeric = Number.parseInt(trimmed.replace(/^#/, ''), 10);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) return undefined;
  return numeric;
}

function normalizeUrl(value: string | undefined): string | undefined {
  const trimmed = normalizeString(value, 240);
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeBullets(value: string | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed) return [];

  const candidates = parseBulletCandidates(trimmed);

  return candidates
    .map(candidate => normalizeString(candidate, LIMITS.bullet))
    .filter((candidate): candidate is string => Boolean(candidate))
    .slice(0, MAX_BULLETS);
}

function parseBulletCandidates(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    // Fall back to simple delimiter parsing below.
  }

  return value
    .split(/\r?\n|\s*[|;]\s*/)
    .map(item => item.trim());
}

export function getDevPreviewMetadata(env: EnvLike = process.env): DevPreviewMetadata | null {
  const id = normalizeString(env.MC_DEV_PREVIEW_ID, LIMITS.id);
  if (!id) return null;

  return {
    enabled: true,
    id,
    pr: normalizePr(env.MC_DEV_PREVIEW_PR),
    branch: normalizeString(env.MC_DEV_PREVIEW_BRANCH, LIMITS.branch),
    title: normalizeString(env.MC_DEV_PREVIEW_TITLE, LIMITS.title),
    summary: normalizeString(env.MC_DEV_PREVIEW_SUMMARY, LIMITS.summary),
    bullets: normalizeBullets(env.MC_DEV_PREVIEW_BULLETS),
    url: normalizeUrl(env.MC_DEV_PREVIEW_URL),
    port: normalizeString(env.MC_DEV_PREVIEW_PORT ?? env.PORT, LIMITS.port),
  };
}

export function getDevPreviewMetadataResponse(env: EnvLike = process.env): DevPreviewMetadataResponse {
  return getDevPreviewMetadata(env) ?? { enabled: false };
}
