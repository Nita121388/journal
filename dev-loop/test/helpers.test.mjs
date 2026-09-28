import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { detectHostPort, REPO_ROOT } from '../lib/host.mjs';

test('detectHostPort reads dev copy port 8766', () => {
  assert.equal(detectHostPort(), 8766);
});

test('REPO_ROOT points at repo root containing extension/', () => {
  assert.ok(existsSync(`${REPO_ROOT}/extension/manifest.json`));
});
