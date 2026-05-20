import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TELEGRAM_SENT_SOUND_ENABLED_STORAGE_KEY,
  isTelegramSentSoundEnabled,
  setTelegramSentSoundEnabled,
} from './telegramSentSound';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test('Telegram sent sound preference defaults on and persists explicit mute', () => {
  const storage = new MemoryStorage();

  assert.equal(isTelegramSentSoundEnabled(storage), true);

  setTelegramSentSoundEnabled(false, storage);
  assert.equal(storage.getItem(TELEGRAM_SENT_SOUND_ENABLED_STORAGE_KEY), 'false');
  assert.equal(isTelegramSentSoundEnabled(storage), false);

  setTelegramSentSoundEnabled(true, storage);
  assert.equal(storage.getItem(TELEGRAM_SENT_SOUND_ENABLED_STORAGE_KEY), 'true');
  assert.equal(isTelegramSentSoundEnabled(storage), true);
});
