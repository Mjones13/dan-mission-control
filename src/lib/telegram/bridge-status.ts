const BRIDGE_STATUS_PATTERNS = [
  // OpenClaw bridge/progress draft starter labels seen in Telegram work chats.
  /^Brin(?:ing|ging)\.\.\./i,
  /^Tide\s*(?:pooling|pulling)\.\.\./i,
  /✉️\s*Message/,
  /🗺️\s*Update Plan/,
  /📖\s*Read:/,
  /🔧\s*(Exec|Tool|Edit|Patch):/,
];

export function isTelegramBridgeStatusMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  return BRIDGE_STATUS_PATTERNS.some((pattern) => pattern.test(text));
}
