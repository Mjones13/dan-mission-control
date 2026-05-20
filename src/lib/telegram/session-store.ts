import fs from 'fs';
import path from 'path';

export function readTelegramSession(sessionPath: string): string {
  if (!fs.existsSync(sessionPath)) return '';
  return fs.readFileSync(sessionPath, 'utf8').trim();
}

export function hasTelegramSession(sessionPath: string): boolean {
  return readTelegramSession(sessionPath).length > 0;
}

export function writeTelegramSession(sessionPath: string, session: string): void {
  const dir = path.dirname(sessionPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(sessionPath, session, { mode: 0o600 });
  fs.chmodSync(sessionPath, 0o600);
}
