export function recoverFailedTelegramDraft(currentDraft: string, failedText: string): string {
  if (!failedText.trim()) return currentDraft;
  if (!currentDraft.trim()) return failedText;
  return `${currentDraft}\n\n${failedText}`;
}

export function canStartTelegramSend(composerText: string, sending: boolean): boolean {
  return !sending && Boolean(composerText.trim());
}

export function shouldSendTelegramComposerFromKeyDown(key: string, shiftKey: boolean): boolean {
  return key === 'Enter' && !shiftKey;
}

export function telegramSendButtonClassName(sending: boolean, compact = false): string {
  const sizeClass = compact ? 'rounded px-3 text-xs' : 'rounded-lg px-4 py-2 text-xs';
  const stateClass = sending
    ? 'bg-emerald-500 text-mc-bg shadow-[0_0_10px_rgba(16,185,129,0.35)] hover:bg-emerald-500 cursor-wait opacity-100'
    : 'bg-mc-accent text-mc-bg hover:bg-mc-accent/90 disabled:cursor-not-allowed disabled:opacity-50';
  return `${sizeClass} font-medium transition-colors ${stateClass}`;
}
