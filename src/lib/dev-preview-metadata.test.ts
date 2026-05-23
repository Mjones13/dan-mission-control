import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDevPreviewMetadata,
  getDevPreviewMetadataResponse,
} from './dev-preview-metadata';

test('returns disabled when preview id is absent', () => {
  assert.equal(getDevPreviewMetadata({}), null);
  assert.deepEqual(getDevPreviewMetadataResponse({}), { enabled: false });
});

test('returns enabled metadata for minimal preview env', () => {
  const metadata = getDevPreviewMetadata({
    MC_DEV_PREVIEW_ID: ' pr-22-abc123 ',
  });

  assert.deepEqual(metadata, {
    enabled: true,
    id: 'pr-22-abc123',
    pr: undefined,
    branch: undefined,
    title: undefined,
    summary: undefined,
    bullets: [],
    url: undefined,
    port: undefined,
  });
});

test('normalizes allowlisted preview metadata fields', () => {
  const metadata = getDevPreviewMetadata({
    MC_DEV_PREVIEW_ID: 'pr-22-abc123',
    MC_DEV_PREVIEW_PR: '#22',
    MC_DEV_PREVIEW_BRANCH: ' finn/mc-dev-preview-identity-banner ',
    MC_DEV_PREVIEW_TITLE: 'Dev preview identity banner',
    MC_DEV_PREVIEW_SUMMARY: 'Show a full-width PR identity banner on preview builds so each feature environment is immediately recognizable.',
    MC_DEV_PREVIEW_BULLETS: '["The stable 4000 app is unchanged by this preview branch.","Dismissal is stored per preview id so each PR can explain itself independently."]',
    MC_DEV_PREVIEW_URL: 'https://github.com/Mjones13/dan-mission-control/pull/22',
    PORT: '4012',
  });

  assert.equal(metadata?.enabled, true);
  assert.equal(metadata?.pr, 22);
  assert.equal(metadata?.branch, 'finn/mc-dev-preview-identity-banner');
  assert.equal(metadata?.title, 'Dev preview identity banner');
  assert.equal(metadata?.summary, 'Show a full-width PR identity banner on preview builds so each feature environment is immediately recognizable.');
  assert.deepEqual(metadata?.bullets, [
    'The stable 4000 app is unchanged by this preview branch.',
    'Dismissal is stored per preview id so each PR can explain itself independently.',
  ]);
  assert.equal(metadata?.url, 'https://github.com/Mjones13/dan-mission-control/pull/22');
  assert.equal(metadata?.port, '4012');
});

test('parses delimiter bullets when JSON is malformed or not used', () => {
  const metadata = getDevPreviewMetadata({
    MC_DEV_PREVIEW_ID: 'pr-22-abc123',
    MC_DEV_PREVIEW_BULLETS: 'first | second; third\nfourth',
  });

  assert.deepEqual(metadata?.bullets, ['first', 'second', 'third', 'fourth']);
});

test('drops invalid PR numbers and non-http URLs', () => {
  const metadata = getDevPreviewMetadata({
    MC_DEV_PREVIEW_ID: 'pr-22-abc123',
    MC_DEV_PREVIEW_PR: 'not-a-number',
    MC_DEV_PREVIEW_URL: 'file:///private/token',
  });

  assert.equal(metadata?.pr, undefined);
  assert.equal(metadata?.url, undefined);
});

test('length-limits displayed fields', () => {
  const metadata = getDevPreviewMetadata({
    MC_DEV_PREVIEW_ID: 'x'.repeat(120),
    MC_DEV_PREVIEW_SUMMARY: 's'.repeat(760),
    MC_DEV_PREVIEW_BULLETS: JSON.stringify(['b'.repeat(320)]),
  });

  assert.equal(metadata?.id.length, 96);
  assert.equal(metadata?.id.endsWith('…'), true);
  assert.equal(metadata?.summary?.length, 720);
  assert.equal(metadata?.summary?.endsWith('…'), true);
  assert.equal(metadata?.bullets[0].length, 280);
  assert.equal(metadata?.bullets[0].endsWith('…'), true);
});
