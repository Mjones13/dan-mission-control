import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { getTelegramConfigStatus } from './config';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('telegram config', () => {
  it('reports missing credentials without exposing secret values', () => {
    delete process.env.TELEGRAM_API_ID;
    delete process.env.TELEGRAM_API_HASH;

    const status = getTelegramConfigStatus();

    assert.equal(status.configured, false);
    assert.equal(status.hasApiId, false);
    assert.equal(status.hasApiHash, false);
    assert.equal(status.apiIdValid, false);
  });

  it('reports configured credentials from environment', () => {
    process.env.TELEGRAM_API_ID = '12345';
    process.env.TELEGRAM_API_HASH = 'secret-value-that-should-not-be-returned';

    const status = getTelegramConfigStatus();

    assert.equal(status.configured, true);
    assert.equal(status.hasApiId, true);
    assert.equal(status.hasApiHash, true);
    assert.equal(status.apiIdValid, true);
    assert.equal('apiHash' in status, false);
  });

  it('rejects invalid API IDs', () => {
    process.env.TELEGRAM_API_ID = 'not-a-number';
    process.env.TELEGRAM_API_HASH = 'secret-value-that-should-not-be-returned';

    const status = getTelegramConfigStatus();

    assert.equal(status.configured, false);
    assert.equal(status.hasApiId, true);
    assert.equal(status.hasApiHash, true);
    assert.equal(status.apiIdValid, false);
  });
});
