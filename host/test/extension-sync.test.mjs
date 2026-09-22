/**
 * extension-sync.test.mjs — 扩展侧同步接线单测
 * 通过 stub global.fetch 验证 extension/lib/sync.js 调用 host 的正确端点。
 * 运行：node --test host/test/extension-sync.test.mjs
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const calls = [];
let responder = async () => ({ ok: true, data: {} });

globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url, method: opts.method ?? 'GET', body: opts.body ? JSON.parse(opts.body) : null });
  const payload = await responder(url, opts);
  return { json: async () => payload };
};

const sync = await import('../../extension/lib/sync.js');

beforeEach(() => { calls.length = 0; responder = async () => ({ ok: true, data: {} }); });

test('getSyncStatus → GET /api/sync/status', async () => {
  responder = async () => ({ ok: true, data: { provider: 'local', enabled: true, deviceId: 'dev_1' } });
  const st = await sync.getSyncStatus();
  assert.equal(st.provider, 'local');
  assert.equal(calls[0].url, 'http://127.0.0.1:8765/api/sync/status');
  assert.equal(calls[0].method, 'GET');
});

test('syncNow → POST /api/sync/now 带 direction', async () => {
  responder = async () => ({ ok: true, data: { provider: 'local', pushed: true } });
  const r = await sync.syncNow('push');
  assert.equal(r.pushed, true);
  assert.equal(calls[0].url, 'http://127.0.0.1:8765/api/sync/now');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].body.direction, 'push');
});

test('syncNow 失败抛错（host 返回 ok:false）', async () => {
  responder = async () => ({ ok: false, error: { code: 'SYNC_DISABLED', message: '同步未开启' } });
  await assert.rejects(() => sync.syncNow(), /同步未开启/);
});

test('saveSyncConfig → PUT /api/sync/config', async () => {
  responder = async () => ({ ok: true, data: { provider: 'github' } });
  await sync.saveSyncConfig({ provider: 'github', github: { owner: 'o', repo: 'r' } });
  assert.equal(calls[0].url, 'http://127.0.0.1:8765/api/sync/config');
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].body.provider, 'github');
});

test('testSync → POST /api/sync/test', async () => {
  responder = async () => ({ ok: true, data: { provider: 'local' } });
  const r = await sync.testSync();
  assert.equal(r.provider, 'local');
  assert.equal(calls[0].url, 'http://127.0.0.1:8765/api/sync/test');
});

test('diffLocalRemote 纯函数', () => {
  const out = sync.diffLocalRemote({ '2026-09-01': 'a' }, { '2026-09-01': 'b', '2026-09-02': 'c' });
  assert.equal(out['2026-09-01'], 'remote');
  assert.equal(out['2026-09-02'], 'remote');
});
