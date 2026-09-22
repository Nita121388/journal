/**
 * backplane.test.mjs — 传输层单测（Memory / LocalFolder / WebDAV / GitHub）
 * WebDAV 与 GitHub 通过注入 mock fetch 验证，不触网。
 * 运行：node --test host/test/backplane.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MemoryBackplane, LocalFolderBackplane, WebDAVBackplane, GitHubBackplane,
  createBackplane, buildSnapshot, parseSnapshot,
} from '../sync/backplane.js';

const resp = (status, body = '') => ({
  ok: status >= 200 && status < 300,
  status,
  async text() { return body; },
  async json() { return JSON.parse(body); },
});

const snap = (cards = []) => buildSnapshot('dev_test', cards, '2026-09-22T00:00:00.000Z');

/* ─── Memory ─────────────────────────────────────────── */

test('Memory：空初始 pull=null，push 后可 pull 回', async () => {
  const b = new MemoryBackplane();
  assert.equal(await b.pull(), null);
  await b.push(snap([{ id: 'c1' }]));
  const got = await b.pull();
  assert.equal(got.cards.length, 1);
  assert.equal((await b.test()).ok, true);
});

/* ─── LocalFolder ────────────────────────────────────── */

test('LocalFolder：往返读写，缺失返回 null', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jsync-'));
  try {
    const b = new LocalFolderBackplane({ dir });
    assert.equal(await b.pull(), null);
    const r = await b.push(snap([{ id: 'c1', content: 'hi' }]));
    assert.equal(r.ok, true);
    const got = await b.pull();
    assert.equal(got.cards[0].content, 'hi');
    assert.equal((await b.test()).provider, 'local');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ─── WebDAV ─────────────────────────────────────────── */

function makeWebDAV() {
  const files = new Map();
  const dirs = new Set();
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    const method = opts.method ?? 'GET';
    calls.push({ method, path: u.pathname });
    if (method === 'PROPFIND') return (dirs.has(u.pathname) || files.has(u.pathname)) ? resp(207) : resp(404);
    if (method === 'MKCOL') { dirs.add(u.pathname); return resp(201); }
    if (method === 'PUT') { files.set(u.pathname, opts.body); return resp(201); }
    if (method === 'GET') return files.has(u.pathname) ? resp(200, files.get(u.pathname)) : resp(404);
    return resp(405);
  };
  return { fetchImpl, files, dirs, calls };
}

test('WebDAV：pull 缺失返回 null，push 建目录并写入，可读回', async () => {
  const dav = makeWebDAV();
  const b = new WebDAVBackplane({ baseUrl: 'https://dav.example.com/remote.php/dav/files/u/', username: 'u', password: 'p', path: 'journal/data.json', fetchImpl: dav.fetchImpl });
  assert.equal(await b.pull(), null);
  await b.push(snap([{ id: 'c1', content: 'dav' }]));
  assert.ok(dav.calls.some(c => c.method === 'MKCOL' && c.path === '/remote.php/dav/files/u/journal/'));
  const got = await b.pull();
  assert.equal(got.cards[0].content, 'dav');
  const t = await b.test();
  assert.equal(t.provider, 'webdav');
});

test('WebDAV：HTTP 错误抛异常', async () => {
  const b = new WebDAVBackplane({ baseUrl: 'https://x/', path: 'a/b.json', fetchImpl: async () => resp(500) });
  await assert.rejects(() => b.pull(), /WebDAV GET/);
});

/* ─── GitHub ─────────────────────────────────────────── */

function makeGitHub({ seeded = {}, putFailOnce = false } = {}) {
  const files = new Map(Object.entries(seeded).map(([k, v]) => [k, { content: v, sha: 'sha_seed' }]));
  const calls = [];
  let putCount = 0;
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    const method = opts.method ?? 'GET';
    calls.push({ method, path: u.pathname });
    const m = u.pathname.match(/\/contents\/(.+)$/);
    if (m && method === 'GET') {
      const key = decodeURIComponent(m[1]);
      if (!files.has(key)) return resp(404, '{}');
      const f = files.get(key);
      return resp(200, JSON.stringify({ content: Buffer.from(f.content).toString('base64'), sha: f.sha }));
    }
    if (m && method === 'PUT') {
      putCount++;
      if (putFailOnce && putCount === 1) return resp(422, '{}');
      const key = decodeURIComponent(m[1]);
      const body = JSON.parse(opts.body);
      files.set(key, { content: Buffer.from(body.content, 'base64').toString('utf-8'), sha: 'sha_new' });
      return resp(200, JSON.stringify({ content: { sha: 'sha_new' } }));
    }
    if (/\/repos\/[^/]+\/[^/]+$/.test(u.pathname)) return resp(200, JSON.stringify({ default_branch: 'main' }));
    const ref = u.pathname.match(/\/git\/ref\/heads\/(.+)$/);
    if (ref && method === 'GET') {
      return ref[1] === 'main' ? resp(200, JSON.stringify({ object: { sha: 'basesha' } })) : resp(404, '{}');
    }
    if (u.pathname.endsWith('/git/refs') && method === 'POST') return resp(201, '{}');
    return resp(404, '{}');
  };
  return { fetchImpl, files, calls };
}

test('GitHub：空仓 pull=null', async () => {
  const gh = makeGitHub();
  const b = new GitHubBackplane({ owner: 'o', repo: 'r', token: 't', branch: 'sync-data', fetchImpl: gh.fetchImpl });
  assert.equal(await b.pull(), null);
});

test('GitHub：push 新建文件（无 sha），可读回', async () => {
  const gh = makeGitHub();
  const b = new GitHubBackplane({ owner: 'o', repo: 'r', token: 't', branch: 'sync-data', path: 'journal-sync.json', fetchImpl: gh.fetchImpl });
  const r = await b.push(snap([{ id: 'c1', content: 'gh' }]));
  assert.equal(r.ok, true);
  const put = gh.calls.find(c => c.method === 'PUT');
  assert.ok(put);
  const got = await b.pull();
  assert.equal(got.cards[0].content, 'gh');
});

test('GitHub：push 更新已有文件（带 sha）', async () => {
  const gh = makeGitHub({ seeded: { 'journal-sync.json': JSON.stringify(snap([{ id: 'old' }])) } });
  const b = new GitHubBackplane({ owner: 'o', repo: 'r', token: 't', branch: 'sync-data', path: 'journal-sync.json', fetchImpl: gh.fetchImpl });
  await b.push(snap([{ id: 'new' }]));
  assert.equal(gh.files.get('journal-sync.json').sha, 'sha_new');
});

test('GitHub：push 首次 422 时自动建分支并重试', async () => {
  const gh = makeGitHub({ putFailOnce: true });
  const b = new GitHubBackplane({ owner: 'o', repo: 'r', token: 't', branch: 'sync-data', path: 'journal-sync.json', fetchImpl: gh.fetchImpl });
  const r = await b.push(snap([{ id: 'c1' }]));
  assert.equal(r.ok, true);
  assert.ok(gh.calls.some(c => c.method === 'POST' && c.path.endsWith('/git/refs')), '应创建分支');
  assert.equal(gh.calls.filter(c => c.method === 'PUT').length, 2, 'PUT 应重试一次');
});

test('GitHub：ensureBranch 在分支缺失时从默认分支创建', async () => {
  const gh = makeGitHub();
  const b = new GitHubBackplane({ owner: 'o', repo: 'r', token: 't', branch: 'sync-data', fetchImpl: gh.fetchImpl });
  const r = await b.ensureBranch();
  assert.equal(r.created, true);
});

test('GitHub：test() 探测仓库', async () => {
  const gh = makeGitHub();
  const b = new GitHubBackplane({ owner: 'o', repo: 'r', token: 't', fetchImpl: gh.fetchImpl });
  assert.equal((await b.test()).repo, 'o/r');
});

/* ─── 工厂 & 快照 ────────────────────────────────────── */

test('createBackplane 按 provider 选择实现，未知 provider 抛错', async () => {
  assert.equal(createBackplane({ provider: 'memory' }).name, 'memory');
  assert.equal(createBackplane({ provider: 'local', local: { dir: '/tmp/x' } }).name, 'local');
  assert.equal(createBackplane({ provider: 'webdav', webdav: { baseUrl: 'https://x/' } }).name, 'webdav');
  assert.equal(createBackplane({ provider: 'github', github: { owner: 'o', repo: 'r' } }).name, 'github');
  assert.throws(() => createBackplane({ provider: 'nope' }), /未知同步 provider/);
});

test('buildSnapshot/parseSnapshot：字段与容错', () => {
  const s = buildSnapshot('dev1', [{ id: 'c1' }]);
  assert.equal(s.schemaVersion, 1);
  assert.equal(s.deviceId, 'dev1');
  assert.equal(parseSnapshot(JSON.stringify(s)).cards.length, 1);
  assert.equal(parseSnapshot(''), null);
});
