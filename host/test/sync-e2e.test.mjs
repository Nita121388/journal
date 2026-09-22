/**
 * sync-e2e.test.mjs — 真实端到端
 *  1) 两台 host 服务（不同数据目录）通过共享本地目录互相同步（REST + engine + merge 全链路）。
 *  2) GitHubBackplane 对真实本地 HTTP 服务（模拟 GitHub Contents API）跑通 push/pull。
 * 运行：node --test host/test/sync-e2e.test.mjs
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server.js';
import { GitHubBackplane, buildSnapshot } from '../sync/backplane.js';

const silo = { debug() {}, info() {}, warn() {}, error() {} };
const dirs = [];
function tmp(prefix) { const d = mkdtempSync(join(tmpdir(), prefix)); dirs.push(d); return d; }

async function api(base, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/* ─── 1. 两台 host 通过共享目录同步 ──────────────────── */

test('端到端：两台 host 经共享目录双向同步并传播删除', async () => {
  const dirA = tmp('jhostA-');
  const dirB = tmp('jhostB-');
  const shared = tmp('jshared-');

  const A = await startServer({ port: 0, dataDir: dirA, logger: silo });
  const B = await startServer({ port: 0, dataDir: dirB, logger: silo });
  try {
    await api(A.url, 'PUT', '/api/sync/config', { provider: 'local', local: { dir: shared } });
    await api(B.url, 'PUT', '/api/sync/config', { provider: 'local', local: { dir: shared } });

    // A 创建卡片 → 同步
    const created = (await api(A.url, 'POST', '/api/cards', { content: 'A 的卡片', type: 'text', assignedDate: '2026-09-22' })).json;
    const id = created.data.id;
    await api(A.url, 'POST', '/api/sync/now', { direction: 'auto' });

    // B 同步 → 应看到 A 的卡片
    await api(B.url, 'POST', '/api/sync/now', { direction: 'auto' });
    let bList = (await api(B.url, 'GET', '/api/cards')).json;
    assert.ok(bList.data.some(c => c.id === id && c.content === 'A 的卡片'), 'B 应看到 A 的卡片');

    // B 删除 → 同步 → A 同步 → A 也删掉
    await api(B.url, 'DELETE', `/api/cards/${id}`);
    await api(B.url, 'POST', '/api/sync/now', { direction: 'auto' });
    await api(A.url, 'POST', '/api/sync/now', { direction: 'auto' });
    const aList = (await api(A.url, 'GET', '/api/cards')).json;
    assert.equal(aList.data.some(c => c.id === id), false, '删除应传播回 A');

    // 再同步一轮，两端一致
    await api(A.url, 'POST', '/api/sync/now', { direction: 'auto' });
    await api(B.url, 'POST', '/api/sync/now', { direction: 'auto' });
    bList = (await api(B.url, 'GET', '/api/cards')).json;
    assert.equal(bList.data.some(c => c.id === id), false);
  } finally {
    await new Promise(r => A.server.close(r)); await A.store.close();
    await new Promise(r => B.server.close(r)); await B.store.close();
  }
});

/* ─── 2. GitHub Backplane 对真实 HTTP 服务 ───────────── */

function makeGitHubHttp() {
  const files = new Map();
  const server = createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const method = req.method;
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      const m = u.pathname.match(/\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
      if (m && method === 'GET') {
        const key = decodeURIComponent(m[3]);
        if (!files.has(key)) return send(404, {});
        const f = files.get(key);
        return send(200, { content: Buffer.from(f.content).toString('base64'), sha: f.sha });
      }
      if (m && method === 'PUT') {
        const key = decodeURIComponent(m[3]);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        files.set(key, { content: Buffer.from(body.content, 'base64').toString('utf-8'), sha: 'sha1' });
        return send(200, { content: { sha: 'sha1' } });
      }
      if (/\/repos\/[^/]+\/[^/]+$/.test(u.pathname)) return send(200, { default_branch: 'main' });
      const ref = u.pathname.match(/\/git\/ref\/heads\/(.+)$/);
      if (ref && method === 'GET') return ref[1] === 'main' ? send(200, { object: { sha: 'base' } }) : send(404, {});
      if (u.pathname.endsWith('/git/refs') && method === 'POST') return send(201, {});
      return send(404, {});
    });
  });
  return { server, files };
}

test('端到端：GitHubBackplane 对真实 HTTP 服务 push/pull', async () => {
  const gh = makeGitHubHttp();
  await new Promise(r => gh.server.listen(0, '127.0.0.1', r));
  const port = gh.server.address().port;
  try {
    const b = new GitHubBackplane({ owner: 'o', repo: 'r', token: 't', branch: 'sync-data', path: 'dir/journal-sync.json', apiBase: `http://127.0.0.1:${port}` });
    assert.equal(await b.pull(), null);
    await b.push(buildSnapshot('dev_x', [{ id: 'c1', content: 'gh-http' }]));
    const got = await b.pull();
    assert.equal(got.cards[0].content, 'gh-http');
    assert.equal((await b.test()).provider, 'github');
  } finally {
    await new Promise(r => gh.server.close(r));
  }
});

/* ─── 3. 两台 host 经 GitHub provider 同步（全链路） ──── */

test('端到端：两台 host 经 GitHub provider（模拟服务）同步', async () => {
  const dirA = tmp('jghA-');
  const dirB = tmp('jghB-');
  const gh = makeGitHubHttp();
  await new Promise(r => gh.server.listen(0, '127.0.0.1', r));
  const port = gh.server.address().port;

  const A = await startServer({ port: 0, dataDir: dirA, logger: silo });
  const B = await startServer({ port: 0, dataDir: dirB, logger: silo });
  const ghCfg = {
    provider: 'github',
    github: { owner: 'o', repo: 'r', branch: 'sync-data', path: 'journal-sync.json', token: 't', apiBase: `http://127.0.0.1:${port}` },
  };
  try {
    await api(A.url, 'PUT', '/api/sync/config', ghCfg);
    await api(B.url, 'PUT', '/api/sync/config', ghCfg);

    const created = (await api(A.url, 'POST', '/api/cards', { content: 'via github', type: 'text', assignedDate: '2026-09-22' })).json;
    const id = created.data.id;
    await api(A.url, 'POST', '/api/sync/now', { direction: 'auto' });
    await api(B.url, 'POST', '/api/sync/now', { direction: 'auto' });

    const bList = (await api(B.url, 'GET', '/api/cards')).json;
    assert.ok(bList.data.some(c => c.id === id && c.content === 'via github'), 'B 应经 GitHub 拿到 A 的卡片');
  } finally {
    await new Promise(r => A.server.close(r)); await A.store.close();
    await new Promise(r => B.server.close(r)); await B.store.close();
    await new Promise(r => gh.server.close(r));
  }
});
