'use client';

export const TELEGRAM_SENT_SOUND_ENABLED_STORAGE_KEY = 'mission-control.telegram.sentSoundEnabled';

const MIN_PLAY_INTERVAL_MS = 250;
const DEFAULT_ENABLED = true;

type BrowserAudioContext = AudioContext;

let audioContext: BrowserAudioContext | null = null;
let lastPlayedAt = 0;

function getStoredPreference(storage: Storage | undefined): boolean {
  if (!storage) return DEFAULT_ENABLED;
  const value = storage.getItem(TELEGRAM_SENT_SOUND_ENABLED_STORAGE_KEY);
  if (value === null) return DEFAULT_ENABLED;
  return value !== 'false';
}

export function isTelegramSentSoundEnabled(storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage): boolean {
  try {
    return getStoredPreference(storage);
  } catch {
    return DEFAULT_ENABLED;
  }
}

export function setTelegramSentSoundEnabled(enabled: boolean, storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage): void {
  try {
    storage?.setItem(TELEGRAM_SENT_SOUND_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Best-effort only; sound preference should never block sending messages.
  }
}

function getAudioContext(): BrowserAudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!isTelegramSentSoundEnabled()) return null;

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return null;

  audioContext ||= new AudioContextConstructor();
  return audioContext;
}

export function primeTelegramSentSound(): void {
  const context = getAudioContext();
  if (!context || context.state !== 'suspended') return;

  void context.resume().catch(() => {
    // Autoplay policies vary by browser; a failed prime simply makes this send silent.
  });
}

export function playTelegramSentSound(now = Date.now()): void {
  const context = getAudioContext();
  if (!context || now - lastPlayedAt < MIN_PLAY_INTERVAL_MS) return;
  lastPlayedAt = now;

  const startAt = context.currentTime;
  const duration = 0.16;
  const masterGain = context.createGain();
  const lowTone = context.createOscillator();
  const highTone = context.createOscillator();
  const filter = context.createBiquadFilter();

  masterGain.gain.setValueAtTime(0.0001, startAt);
  masterGain.gain.exponentialRampToValueAtTime(0.035, startAt + 0.015);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1800, startAt);
  filter.frequency.exponentialRampToValueAtTime(520, startAt + duration);

  lowTone.type = 'sine';
  lowTone.frequency.setValueAtTime(560, startAt);
  lowTone.frequency.exponentialRampToValueAtTime(220, startAt + duration);

  highTone.type = 'triangle';
  highTone.frequency.setValueAtTime(980, startAt);
  highTone.frequency.exponentialRampToValueAtTime(360, startAt + duration);

  lowTone.connect(filter);
  highTone.connect(filter);
  filter.connect(masterGain);
  masterGain.connect(context.destination);

  lowTone.start(startAt);
  highTone.start(startAt);
  lowTone.stop(startAt + duration);
  highTone.stop(startAt + duration);
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
