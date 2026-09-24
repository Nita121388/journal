/**
 * backplane.js — 可插拔同步传输层
 *
 * 每个 Backplane 只负责把一份「快照」(snapshot) 读写到某个介质：
 *   pull()          -> snapshot | null
 *   push(snapshot)  -> { ok, ref? }
 *   test()          -> { ok, ... }
 * 它不参与合并、不感知存储 —— 换介质只需换一个实现。
 *
 * 实现：Memory / LocalFolder / WebDAV / GitHub（REST Contents API）。
 * 只用 node 内置（fs / fetch / Buffer），fetch 可注入以便测试。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { hostname } from 'node:os';

import { serializeAll, parseAll, INBOX_FILE } from './mdformat.js';

/* ─── 快照工具 ───────────────────────────────────────── */

export const SNAPSHOT_SCHEMA_VERSION = 1;

/** @param {string} deviceId @param {object[]} cards @returns {object} */
export function buildSnapshot(deviceId, cards, generatedAt = new Date().toISOString()) {
  return { schemaVersion: SNAPSHOT_SCHEMA_VERSION, deviceId, generatedAt, cards };
}

export function parseSnapshot(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== 'object') return null;
  return { schemaVersion: obj.schemaVersion ?? 1, deviceId: obj.deviceId ?? null, generatedAt: obj.generatedAt ?? null, cards: Array.isArray(obj.cards) ? obj.cards : [] };
}

/* ─── Memory ─────────────────────────────────────────── */

export class MemoryBackplane {
  constructor(initial = null) { this.name = 'memory'; this.snapshot = initial ? structuredClone(initial) : null; }
  async pull() { return this.snapshot ? structuredClone(this.snapshot) : null; }
  async push(snapshot) { this.snapshot = structuredClone(snapshot); return { ok: true, ref: 'memory' }; }
  async test() { return { ok: true, provider: 'memory' }; }
}

/* ─── LocalFolder ────────────────────────────────────── */

export class LocalFolderBackplane {
  constructor({ dir, filename = 'journal-sync.json' }) {
    if (!dir) throw new Error('LocalFolderBackplane: dir required');
    this.name = 'local';
    this.dir = dir;
    this.filename = filename;
  }
  get filePath() { return join(this.dir, this.filename); }
  async pull() {
    if (!existsSync(this.filePath)) return null;
    return parseSnapshot(readFileSync(this.filePath, 'utf-8'));
  }
  async push(snapshot) {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    return { ok: true, ref: this.filePath };
  }
  async test() {
    mkdirSync(this.dir, { recursive: true });
    return { ok: true, provider: 'local', dir: this.dir };
  }
}

/**
 * Markdown / Obsidian Backplane —— 把 journal 数据同步到**人类可读可编辑**的 md 文件。
 *
 * 与 LocalFolderBackplane（单文件 JSON）不同，这里**一天一个 md 文件**：
 *   journal/2026-09-24.md   含 frontmatter 属性 + 内联属性的卡片
 *   journal/inbox.md        卡片池（未安排）
 *
 * 用途：在 Obsidian 里直接看/改日志；改动经 `pull()` 回流参与 LWW 合并。
 * 注意：目录下**非日期命名**的 .md（用户自己的笔记）不会被解析，避免误吞。
 */
export class MarkdownBackplane {
  constructor({ dir } = {}) {
    if (!dir) throw new Error('MarkdownBackplane: dir required（在设置里配置 md 目录）');
    this.name = 'markdown';
    this.dir = dir;
  }

  /** 列出目录里所有 journal md 文件（日期文件 + inbox） */
  _journalFiles() {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter(n => n.endsWith('.md'))
      .filter(n => n === INBOX_FILE || /^\d{4}-\d{2}-\d{2}\.md$/.test(n));
  }

  async pull() {
    const names = this._journalFiles();
    if (!names.length) return null;
    const files = {};
    for (const n of names) {
      try {
        const p = join(this.dir, n);
        files[n] = {
          text: readFileSync(p, 'utf-8'),
          mtimeIso: statSync(p).mtime.toISOString(),
        };
      } catch { /* 跳过读不了的文件 */ }
    }
    const cards = parseAll(files);
    return { schemaVersion: SNAPSHOT_SCHEMA_VERSION, deviceId: null, generatedAt: null, cards };
  }

  async push(snapshot) {
    mkdirSync(this.dir, { recursive: true });
    // 文件级属性：device = 本机；project = 当天卡片的创建项目（取首个非空，当天多个项目时取第一个）
    const host = hostname();
    const cards = snapshot?.cards ?? [];
    const projByDay = {};
    for (const c of cards) {
      if (!c.assignedDate) continue;
      const p = c.meta?.createdBy?.project ?? c.meta?.updatedBy?.project;
      if (p && !projByDay[c.assignedDate]) projByDay[c.assignedDate] = p;
    }
    const files = serializeAll(cards, { device: host });
    // 重新序列化以注入 project（serializeAll 不重复调用，直接在文件头注入）
    for (const [name, text] of Object.entries(files)) {
      const day = name.replace(/\.md$/, '');
      const proj = projByDay[day];
      let finalText = text;
      if (proj && !/^project:/m.test(text)) {
        // 在 `date: ...` 后插一行 project
        finalText = text.replace(/^(date: .*)$/m, '$1\nproject: ' + proj);
      }
      writeFileSync(join(this.dir, name), finalText, 'utf-8');
    }
    return { ok: true, ref: this.dir, files: Object.keys(files).length };
  }

  async test() {
    mkdirSync(this.dir, { recursive: true });
    return { ok: true, provider: 'markdown', dir: this.dir };
  }
}

/* ─── WebDAV ─────────────────────────────────────────── */

export class WebDAVBackplane {
  /**
   * @param {{baseUrl:string, username?:string, password?:string, path?:string, fetchImpl?:Function}} cfg
   */
  constructor({ baseUrl, username = '', password = '', path = 'journal/data.json', fetchImpl } = {}) {
    if (!baseUrl) throw new Error('WebDAVBackplane: baseUrl required');
    this.name = 'webdav';
    this.base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    this.username = username;
    this.password = password;
    this.path = path.replace(/^\/+/, '');
    this.fetch = fetchImpl ?? globalThis.fetch;
  }
  _headers(extra = {}) {
    const token = Buffer.from(`${this.username}:${this.password}`, 'utf-8').toString('base64');
    return { Authorization: `Basic ${token}`, ...extra };
  }
  async _ensureDir(relDir) {
    const clean = String(relDir).replace(/^\/+|\/+$/g, '');
    if (!clean) return;
    let acc = '';
    for (const seg of clean.split('/')) {
      acc = acc ? `${acc}/${seg}` : seg;
      const res = await this.fetch(this.base + acc + '/', { method: 'PROPFIND', headers: this._headers({ Depth: '0' }) });
      if (res.status === 404) {
        const mk = await this.fetch(this.base + acc + '/', { method: 'MKCOL', headers: this._headers() });
        if (!mk.ok && mk.status !== 405) throw new Error(`WebDAV MKCOL ${acc} -> ${mk.status}`);
      } else if (!res.ok && res.status !== 207) {
        throw new Error(`WebDAV PROPFIND ${acc} -> ${res.status}`);
      }
    }
  }
  async pull() {
    const res = await this.fetch(this.base + this.path, { headers: this._headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`WebDAV GET -> ${res.status}`);
    return parseSnapshot(await res.text());
  }
  async push(snapshot) {
    const dir = this.path.split('/').slice(0, -1).join('/');
    await this._ensureDir(dir);
    const res = await this.fetch(this.base + this.path, {
      method: 'PUT',
      headers: this._headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(snapshot, null, 2),
    });
    if (!res.ok) throw new Error(`WebDAV PUT -> ${res.status}`);
    return { ok: true, ref: this.base + this.path };
  }
  async test() {
    const dir = this.path.split('/').slice(0, -1).join('/');
    await this._ensureDir(dir);
    const res = await this.fetch(this.base + dir + '/', { method: 'PROPFIND', headers: this._headers({ Depth: '0' }) });
    if (!res.ok && res.status !== 207) throw new Error(`WebDAV test -> ${res.status}`);
    return { ok: true, provider: 'webdav', server: this.base + dir };
  }
}

/* ─── GitHub（REST Contents API） ──────────────────── */

export class GitHubBackplane {
  /**
   * @param {{owner:string, repo:string, token:string, branch?:string, path?:string,
   *          apiBase?:string, fetchImpl?:Function, commitMessage?:string}} cfg
   */
  constructor({ owner, repo, token, branch = 'sync-data', path = 'journal-sync.json', apiBase = 'https://api.github.com', fetchImpl, commitMessage = 'journal: sync' } = {}) {
    if (!owner || !repo) throw new Error('GitHubBackplane: owner & repo required');
    this.name = 'github';
    this.owner = owner;
    this.repo = repo;
    this.token = token ?? '';
    this.branch = branch;
    this.path = path.replace(/^\/+/, '');
    this.apiBase = apiBase.replace(/\/+$/, '');
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.commitMessage = commitMessage;
  }
  _headers(extra = {}) {
    const h = { Accept: 'application/vnd.github+json', 'User-Agent': 'journal-host', ...extra };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }
  _contentsUrl() {
    return `${this.apiBase}/repos/${this.owner}/${this.repo}/contents/${this.path}`;
  }
  async _getFileSha() {
    const res = await this.fetch(`${this._contentsUrl()}?ref=${encodeURIComponent(this.branch)}`, { headers: this._headers() });
    if (res.status === 404) return { sha: null, exists: false };
    if (!res.ok) throw new Error(`GitHub GET -> ${res.status}`);
    const body = await res.json();
    return { sha: body.sha ?? null, exists: true };
  }
  /** 若分支不存在则从默认分支创建（幂等） */
  async ensureBranch() {
    const refUrl = `${this.apiBase}/repos/${this.owner}/${this.repo}/git/ref/heads/${this.branch}`;
    let res = await this.fetch(refUrl, { headers: this._headers() });
    if (res.ok) return { created: false };
    if (res.status !== 404) throw new Error(`GitHub ref -> ${res.status}`);
    const repoRes = await this.fetch(`${this.apiBase}/repos/${this.owner}/${this.repo}`, { headers: this._headers() });
    if (!repoRes.ok) throw new Error(`GitHub repo -> ${repoRes.status}`);
    const { default_branch: def = 'main' } = await repoRes.json();
    const defRes = await this.fetch(`${this.apiBase}/repos/${this.owner}/${this.repo}/git/ref/heads/${def}`, { headers: this._headers() });
    if (!defRes.ok) throw new Error(`GitHub default ref -> ${defRes.status}`);
    const { object } = await defRes.json();
    const createRes = await this.fetch(`${this.apiBase}/repos/${this.owner}/${this.repo}/git/refs`, {
      method: 'POST',
      headers: this._headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ref: `refs/heads/${this.branch}`, sha: object.sha }),
    });
    if (!createRes.ok && createRes.status !== 422) throw new Error(`GitHub create ref -> ${createRes.status}`);
    return { created: true };
  }
  async pull() {
    const res = await this.fetch(`${this._contentsUrl()}?ref=${encodeURIComponent(this.branch)}`, { headers: this._headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub GET -> ${res.status}`);
    const body = await res.json();
    if (!body.content) return null;
    const text = Buffer.from(body.content, 'base64').toString('utf-8');
    return parseSnapshot(text);
  }
  async push(snapshot) {
    const { sha } = await this._getFileSha();
    const payload = {
      message: this.commitMessage,
      content: Buffer.from(JSON.stringify(snapshot, null, 2), 'utf-8').toString('base64'),
      branch: this.branch,
      ...(sha ? { sha } : {}),
    };
    let res = await this.fetch(this._contentsUrl(), {
      method: 'PUT',
      headers: this._headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    if (!res.ok && (res.status === 404 || res.status === 409 || res.status === 422)) {
      await this.ensureBranch();
      const retry = await this._getFileSha();
      const payload2 = { ...payload, ...(retry.sha ? { sha: retry.sha } : {}) };
      if (!retry.sha) delete payload2.sha;
      res = await this.fetch(this._contentsUrl(), {
        method: 'PUT',
        headers: this._headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload2),
      });
    }
    if (!res.ok) throw new Error(`GitHub PUT -> ${res.status}`);
    return { ok: true, ref: `${this.owner}/${this.repo}@${this.branch}:${this.path}` };
  }
  async test() {
    const res = await this.fetch(`${this.apiBase}/repos/${this.owner}/${this.repo}`, { headers: this._headers() });
    if (!res.ok) throw new Error(`GitHub test -> ${res.status}`);
    return { ok: true, provider: 'github', repo: `${this.owner}/${this.repo}`, branch: this.branch };
  }
}

/* ─── 工厂 ───────────────────────────────────────────── */

/**
 * 由 settings.sync 配置构造 Backplane。
 * @param {object} sync settings.sync
 * @param {{fetchImpl?:Function}} [opts]
 */
export function createBackplane(sync = {}, opts = {}) {
  const provider = sync.provider;
  switch (provider) {
    case 'memory': return new MemoryBackplane();
    case 'local': {
      const dir = sync.local?.dir;
      if (!dir) throw new Error('sync.local.dir 未配置');
      return new LocalFolderBackplane({ dir, filename: sync.local?.filename, fetchImpl: opts.fetchImpl });
    }
    case 'webdav':
      return new WebDAVBackplane({ ...sync.webdav, fetchImpl: opts.fetchImpl });
    case 'markdown': {
      const dir = sync.markdown?.dir;
      if (!dir) throw new Error('sync.markdown.dir 未配置（md 目录）');
      return new MarkdownBackplane({ dir });
    }
    case 'github':
      return new GitHubBackplane({ ...sync.github, fetchImpl: opts.fetchImpl });
    default:
      throw new Error(`未知同步 provider: ${provider ?? '(空)'}`);
  }
}
