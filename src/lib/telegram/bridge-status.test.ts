import assert from 'node:assert/strict';
import test from 'node:test';
import { isTelegramBridgeStatusMessage } from './bridge-status';

test('isTelegramBridgeStatusMessage matches known bridge, status, and thought patterns', () => {
  for (const text of [
    'Brining...',
    'Bringing...',
    'Tidepooling...',
    'Tide pulling...',
    '✉️ Message',
    '🗺️ Update Plan',
    '📖 Read: docs/example.md',
    '🔧 Exec: npm test',
    '🔧 Tool: read',
    '🔧 Edit: src/file.ts',
    '🔧 Patch: update',
  ]) {
    assert.equal(isTelegramBridgeStatusMessage(text), true, text);
  }
});

test('isTelegramBridgeStatusMessage does not match normal human text or empty text', () => {
  for (const text of [
    'Can you take a look at this?',
    'Message me when ready',
    'Read: I liked that paragraph',
    '',
    null,
    undefined,
  ]) {
    assert.equal(isTelegramBridgeStatusMessage(text), false, String(text));
  }
});
