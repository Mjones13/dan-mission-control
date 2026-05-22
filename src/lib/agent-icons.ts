export const AGENT_AVATAR_EMOJI_BY_NAME: Record<string, string> = {
  finn: '🐒',
  jace: '🐬',
  leo: '🦁',
  atlas: '🌎',
  feynman: '📚',
  forge: '🏗️',
  marshal: '🎖️',
  canary: '🐤',
  harbor: '🛳️',
};

export function getKnownAgentAvatarEmoji(name: string | null | undefined): string | null {
  const normalized = name?.toLowerCase() || '';
  for (const [agentName, emoji] of Object.entries(AGENT_AVATAR_EMOJI_BY_NAME)) {
    if (normalized.includes(agentName)) return emoji;
  }
  return null;
}
