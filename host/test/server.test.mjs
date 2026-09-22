/**
 * server.test.mjs — host REST 集成测试（临时数据目录 + 随机端口）
 * 运行：node --test host/test/server.test.mjs
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server.js';

const dir = mkdtempSync(join(tmpdir(), 'jserver-'));
const { server, store, url } = await startServer({ port: 0, dataDir: dir, logger: { debug(){}, info(){}, warn(){}, error(){} } });

after(async () => {
  await new Promise(r => server.close(r));
  await store.close();
  rmSync(dir, { recursive: true, force: true });
});

async function api(method, path, body) {
  const res = await fetch(url + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

test('GET /api/health 返回运行状态与 sqlite 存储', async () => {
  const { status, json } = await api('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.data.status, 'running');
  assert.equal(json.data.store, 'sqlite');
});

test('卡片 CRUD：创建→查询→更新→删除（墓碑隐藏）', async () => {
  const created = (await api('POST', '/api/cards', { content: '买咖啡', type: 'task', assignedDate: '2026-09-22', time: '09:00' })).json;
  assert.equal(created.ok, true);
  const id = created.data.id;

  let list = (await api('GET', '/api/cards')).json;
  assert.ok(list.data.some(c => c.id === id));

  const updated = (await api('PUT', `/api/cards/${id}`, { content: '买茶', done: true })).json;
  assert.equal(updated.data.content, '买茶');
  assert.equal(updated.data.done, true);

  assert.equal((await api('DELETE', `/api/cards/${id}`)).json.ok, true);
  list = (await api('GET', '/api/cards')).json;
  assert.equal(list.data.some(c => c.id === id), false);
});

test('校验：缺少 content 返回 400 VALIDATION_ERROR', async () => {
  const { status, json } = await api('POST', '/api/cards', { type: 'text' });
  assert.equal(status, 400);
  assert.equal(json.ok, false);
  assert.equal(json.error.code, 'VALIDATION_ERROR');
});

test('journals：PUT 写入、GET 读回、heatmap 计数', async () => {
  assert.equal((await api('PUT', '/api/journals/2026-09-08', { markdown: '今天的记录' })).json.ok, true);
  const got = (await api('GET', '/api/journals/2026-09-08')).json;
  assert.equal(got.data.content, '今天的记录');

  const heatmap = (await api('GET', '/api/heatmap')).json;
  assert.equal(heatmap.data['2026-09-08'], 1);
});

test('todos：POST 创建（带 --time 刻度）+ GET + done', async () => {
  const created = (await api('POST', '/api/todos', { title: '写周报', due: '2026-09-23', time: '14:00' })).json;
  assert.equal(created.ok, true);
  assert.equal(created.data.time, '14:00');
  assert.equal(created.data.title, '写周报');

  const list = (await api('GET', '/api/todos')).json;
  assert.ok(list.data.some(t => t.id === created.data.id));

  const done = (await api('PUT', `/api/todos/${created.data.id}`, { done: true })).json;
  assert.equal(done.data.done, true);
});

test('sync/status：默认关闭', async () => {
  const st = (await api('GET', '/api/sync/status')).json;
  assert.equal(st.ok, true);
  assert.equal(st.data.provider, 'off');
  assert.equal(st.data.enabled, false);
});

test('sync：配置 local provider → 手动同步 → 生成快照文件', async () => {
  const syncDir = join(dir, 'sync-target');
  const cfg = (await api('PUT', '/api/sync/config', { provider: 'local', local: { dir: syncDir } })).json;
  assert.equal(cfg.data.provider, 'local');

  const status = (await api('GET', '/api/sync/status')).json;
  assert.equal(status.data.provider, 'local');
  assert.equal(status.data.enabled, true);

  const now = (await api('POST', '/api/sync/now', { direction: 'auto' })).json;
  assert.equal(now.ok, true);
  assert.equal(now.data.provider, 'local');
  assert.ok(existsSync(join(syncDir, 'journal-sync.json')), '应生成快照文件');
});

test('sync/test：local provider 连接测试通过', async () => {
  const r = (await api('POST', '/api/sync/test')).json;
  assert.equal(r.ok, true);
  assert.equal(r.data.provider, 'local');
});

test('sync/config：密钥脱敏（token/password 不回传明文）', async () => {
  await api('PUT', '/api/sync/config', { provider: 'github', github: { owner: 'o', repo: 'r', token: 'secret123', branch: 'sync-data' } });
  const cfg = (await api('GET', '/api/sync/config')).json;
  assert.equal(cfg.data.github.token, '');
  assert.equal(cfg.data.github.tokenSet, true);
  // 留空 token 再更新，不应清空原 token
  await api('PUT', '/api/sync/config', { github: { owner: 'o', repo: 'r2', token: '' } });
  const cfg2 = (await api('GET', '/api/sync/config')).json;
  assert.equal(cfg2.data.github.tokenSet, true);
  assert.equal(cfg2.data.github.repo, 'r2');
});

test('sync/now：未配置 provider 时返回 SYNC_DISABLED', async () => {
  await api('PUT', '/api/sync/config', { provider: 'off' });
  const { status, json } = await api('POST', '/api/sync/now', {});
  assert.equal(status, 400);
  assert.equal(json.error.code, 'SYNC_DISABLED');
});
