/**
 * server.js — Journal 本地 HTTP 服务端
 * 运行在 127.0.0.1:8765，数据持久化到 SQLite（host/lib/storage.js）。
 * 提供日志/卡片/待办/技能/同步的 REST API，供扩展和 CLI 使用。
 *
 * 可测试化：导出 createApp(store) 与 startServer(opts)；直接运行本文件时自动启动。
 */

import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hostname, platform, release } from 'node:os';

import { createStore } from './lib/storage.js';
import { createLogger } from './lib/logger.js';
import { createBackplane } from './sync/backplane.js';
import { runSync, syncStatus } from './sync/engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = 8765;
const DEFAULT_HOST = '127.0.0.1';

// skills 物理目录（junction 指向 skillshare）。可用环境变量覆盖
const SKILLS_DIR = process.env.JOURNAL_SKILLS_DIR || 'C:\\Users\\chemclin\\AppData\\Roaming\\skillshare\\skills';

// ── 小工具 ────────────────────────────────────────────

/** "HH:MM" 格式校验（00:00 ~ 23:59） */
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "HH:MM" + n 分钟 → "HH:MM"（跨天取模） */
function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

/** task card → todo 视图（CLI / 旧接口兼容） */
function cardToTodo(c) {
  return {
    id: c.id,
    title: c.content,
    done: Boolean(c.done),
    priority: ['high', 'medium', 'low'].includes(c.priority) ? c.priority : 'medium',
    due: c.assignedDate ?? null,
    time: c.startTime ?? c.time ?? null,
  };
}

/* ─── HTTP 工具 ────────────────────────────────────────── */

function json(res, status, body) {
  const str = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(str),
  });
  res.end(str);
}

function ok(res, data) { return json(res, 200, { ok: true, data }); }
function err(res, status, code, message) { return json(res, status, { ok: false, error: { code, message } }); }

function parseReq(req) {
  return new Promise((resolve, reject) => {
    const url = new URL(req.url, `http://${DEFAULT_HOST}:${DEFAULT_PORT}`);
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      let body = null;
      if (raw) { try { body = JSON.parse(raw); } catch { body = null; } }
      resolve({ method: req.method, path: url.pathname, body, query: url.searchParams });
    });
    req.on('error', reject);
  });
}

/* ─── skills 扫描 ────────────────────────────────────────── */

function statSyncSafe(p) {
  try { const s = statSync(p); return s.isFile() ? true : null; } catch { return null; }
}

function findSkillMd(dir) {
  const cands = [join(dir, 'SKILL.md')];
  try {
    for (const n of readdirSync(dir)) {
      const sub = join(dir, n, 'SKILL.md');
      if (statSyncSafe(sub)) { cands.push(sub); break; }
    }
  } catch { /* ignore */ }
  for (const p of cands) if (statSyncSafe(p)) return p;
  return null;
}

function parseSkillFrontmatter(skillMd) {
  try {
    const raw = readFileSync(skillMd, 'utf-8');
    const m = raw.match(/^---\s*\n([\s\S]*?)\n---/);
    const fm = {};
    if (m) {
      for (const line of m[1].split('\n')) {
        const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
        if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
      }
    }
    return {
      name: fm.name ?? skillMd.split(sep).filter(Boolean).slice(-2, -1)[0] ?? '',
      description: fm.description ?? '',
    };
  } catch { return { name: '', description: '' }; }
}

function scanSkills() {
  let names;
  try { names = readdirSync(SKILLS_DIR); } catch { return { dir: SKILLS_DIR, exists: false, skills: [] }; }
  const skills = names
    .filter(n => !n.startsWith('.'))
    .map(name => {
      const dir = join(SKILLS_DIR, name);
      let isDir = false;
      try { isDir = statSync(dir).isDirectory(); } catch { /* ignore */ }
      if (!isDir) return null;
      const skillMd = findSkillMd(dir);
      const { name: n2, description } = parseSkillFrontmatter(skillMd ?? join(dir, 'SKILL.md'));
      return { name: n2 || name, slug: name, installed: true, dir, skillMd: skillMd ?? null, description: description.slice(0, 200) };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { dir: SKILLS_DIR, exists: true, skills };
}

/* ─── journal skill 安装状态检测 ────────────────────────── */

const SKILL_NAME = 'journal';
const PROJECT_DIR = process.env.JOURNAL_PROJECT_DIR || 'E:\\projects\\journal';
const USER_SKILLS_DIRS = {
  Pi: 'C:\\Users\\chemclin\\.agents\\skills',
  Claude: 'C:\\Users\\chemclin\\.claude\\skills',
  Codex: 'C:\\Users\\chemclin\\.codex\\skills',
};

function checkSkillStatus() {
  const locations = [
    { platform: '项目自带', path: join(PROJECT_DIR, '.agents', 'skills', SKILL_NAME, 'SKILL.md') },
  ];
  for (const [platform, dir] of Object.entries(USER_SKILLS_DIRS)) {
    locations.push({ platform, path: join(dir, SKILL_NAME, 'SKILL.md') });
  }
  locations.push({ platform: 'skillshare全局', path: join(SKILLS_DIR, SKILL_NAME, 'SKILL.md') });

  const detail = locations.map(loc => ({
    platform: loc.platform,
    path: loc.path,
    installed: statSyncSafe(loc.path) ? true : false,
  }));
  const installedCount = detail.filter(d => d.installed).length;
  return { name: SKILL_NAME, installed: installedCount > 0, installedCount, total: detail.length, locations: detail };
}

/* ─── 同步配置（脱敏） ──────────────────────────────────── */

/* ─── 来源元数据（provenance） ───────────────────────────── */

const ORIGINS = ['human', 'agent-assisted', 'agent-auto'];

/** 电脑信息（只算一次） */
function deviceInfo() {
  return { hostname: hostname(), platform: platform(), release: release() };
}

/**
 * 从请求 body 封装来源事件。
 * 调用方传 `{ origin, agent?, model?, project? }`，host 补 device/at。
 * 缺省 origin → human（本地直连默认人为）。
 * @param {object|undefined} ctx
 * @returns {{origin:string, agent?:string, model?:string, project?:string, device:object, at:string}}
 */
function provenanceEvent(ctx = {}) {
  const origin = ORIGINS.includes(ctx.origin) ? ctx.origin : 'human';
  const ev = { origin, device: deviceInfo(), at: new Date().toISOString() };
  if (typeof ctx.agent === 'string' && ctx.agent) ev.agent = ctx.agent;
  if (typeof ctx.model === 'string' && ctx.model) ev.model = ctx.model;
  if (typeof ctx.project === 'string' && ctx.project) ev.project = ctx.project;
  return ev;
}

/** 创建时的 meta：createdBy = updatedBy = 同一事件 */
function provenanceForCreate(ctx) {
  const ev = provenanceEvent(ctx);
  return { createdBy: ev, updatedBy: ev };
}

/**
 * 更新时的 meta：createdBy 保留原值（仅首次创建时写），updatedBy 覆盖。
 * @param {object|undefined} existingMeta — 卡片当前 meta
 * @param {object} ctx — 本次请求的来源
 * @param {string} [fallbackProject] — 本次未带 project 时沿用旧 project
 */
function provenanceForUpdate(existingMeta = null, ctx = {}, fallbackProject = null) {
  const ev = provenanceEvent(ctx);
  if (!ev.project && fallbackProject) ev.project = fallbackProject;
  return {
    // 老卡（从未写过 meta）首次写入时，createdBy 用当次 ctx 初始化（不留 null）；
    // 已有 createdBy 的卡不会被后续更新覆盖 —— 保护「谁创建」
    createdBy: existingMeta?.createdBy ?? ev,
    updatedBy: ev,
  };
}

/** 对外返回时隐藏密钥，只给「是否已设置」标记 */
function maskSyncConfig(cfg = {}) {
  const out = structuredClone(cfg ?? {});
  if (out.github) { out.github.tokenSet = Boolean(out.github.token); out.github.token = ''; }
  if (out.webdav) { out.webdav.passwordSet = Boolean(out.webdav.password); out.webdav.password = ''; }
  return out;
}

/** 合并配置：密钥留空表示「不修改」 */
function mergeSyncConfig(existing = {}, patch = {}) {
  const next = { ...existing, ...patch };
  for (const p of ['local', 'webdav', 'github', 'markdown']) {
    if (patch[p]) next[p] = { ...(existing[p] || {}), ...patch[p] };
  }
  if (next.github && (!patch.github || !patch.github.token)) next.github.token = existing.github?.token ?? '';
  if (next.webdav && (!patch.webdav || !patch.webdav.password)) next.webdav.password = existing.webdav?.password ?? '';
  return next;
}

/* ─── 应用（路由） ─────────────────────────────────────── */

/**
 * 构造 HTTP 处理器。
 * @param {object} store — host/lib/storage.js store
 * @param {{logger?:object}} [opts]
 */
export async function createApp(store, { logger } = {}) {
  const log = logger ?? createLogger('server');
  let syncInFlight = null; // 防止并发同步

  async function handleSync(store, provider, direction) {
    const settings = await store.getSettings();
    const sync = settings.sync ?? {};
    if (!sync.provider || sync.provider === 'off') {
      return { ok: false, code: 'SYNC_DISABLED', status: 400, message: '同步未开启：请先在设置里选择 provider' };
    }
    let backplane;
    try {
      backplane = createBackplane(sync);
    } catch (e) {
      // 配置缺失时给出可执行指引（去哪配），而不是只抛字段名
      const hint = '请到扩展选项页 → 数据同步 配置后重试（或 node cli.mjs sync config 查看）';
      return { ok: false, code: 'SYNC_CONFIG', status: 400, message: `${e.message}。${hint}` };
    }
    if (syncInFlight) return syncInFlight;
    syncInFlight = (async () => {
      try {
        const result = await runSync({ store, backplane, direction });
        log.info(`sync ${provider} ${direction}: +${result.merged?.added ?? 0} ~${result.merged?.updated ?? 0} -${result.merged?.deleted ?? 0}`);
        return { ok: true, result };
      } catch (e) {
        log.warn(`sync failed: ${e.message}`);
        return { ok: false, code: 'SYNC_ERROR', status: 502, message: e.message };
      } finally {
        syncInFlight = null;
      }
    })();
    return syncInFlight;
  }

  return async function handle(req, res) {
    const { method, path, body } = await parseReq(req);

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }

    const dayMatch = path.match(/^\/api\/journals\/(\d{4}-\d{2}-\d{2})$/);
    const todoMatch = path.match(/^\/api\/todos\/([\w-]+)$/);
    const cardMatch = path.match(/^\/api\/cards\/([\w-]+)$/);

    try {
      // ── Cards ────────────────────────────────────────
      if (path === '/api/cards' && method === 'GET') {
        return ok(res, await store.listCards());
      }
      if (path === '/api/cards' && method === 'POST') {
        if (typeof body?.content !== 'string') return err(res, 400, 'VALIDATION_ERROR', 'body.content 必须是字符串');
        const card = await store.createCard({
          content: body.content,
          type: body.type,
          done: body.done,
          assignedDate: body.assignedDate,
          time: body.time,
          startTime: body.startTime,
          endTime: body.endTime,
          priority: body.priority,
          tags: body.tags,
          meta: provenanceForCreate(body.provenance),
        });
        return ok(res, card);
      }
      if (cardMatch && method === 'PUT') {
        const existing = await store.getCard(cardMatch[1]);
        const patch = { ...(body ?? {}) };
        // meta 不接受外部直接写：由 host 按 provenance 封装，保护 createdBy
        delete patch.meta;
        const fallbackProject = existing?.meta?.updatedBy?.project ?? existing?.meta?.createdBy?.project ?? null;
        patch.meta = provenanceForUpdate(existing?.meta ?? null, body?.provenance, fallbackProject);
        const card = await store.updateCard(cardMatch[1], patch);
        if (!card) return err(res, 404, 'NOT_FOUND', `Card ${cardMatch[1]} not found`);
        return ok(res, card);
      }
      if (cardMatch && method === 'DELETE') {
        const removed = await store.deleteCard(cardMatch[1]);
        if (!removed) return err(res, 404, 'NOT_FOUND', `Card ${cardMatch[1]} not found`);
        return ok(res, null);
      }
      if (path === '/api/tags' && method === 'GET') {
        const counts = new Map();
        for (const card of await store.listCards()) {
          for (const tag of card.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
        const tags = [...counts.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        return ok(res, { tags });
      }

      // ── Journals ──────────────────────────────────────
      if (path === '/api/journals' && method === 'GET') {
        return ok(res, await store.getJournals());
      }
      if (dayMatch && method === 'GET') {
        return ok(res, await store.getJournal(dayMatch[1]));
      }
      if (dayMatch && method === 'PUT') {
        if (typeof body?.markdown !== 'string') return err(res, 400, 'VALIDATION_ERROR', 'body.markdown 必须是字符串');
        const entry = await store.setJournal(dayMatch[1], body.markdown);
        return ok(res, entry);
      }
      if (dayMatch && method === 'DELETE') {
        await store.deleteJournal(dayMatch[1]);
        return ok(res, null);
      }

      // ── Todos ─────────────────────────────────────────
      if (path === '/api/todos' && method === 'GET') {
        const cards = await store.listCards();
        return ok(res, cards.filter(c => c.type === 'task').map(cardToTodo));
      }
      if (path === '/api/todos' && method === 'POST') {
        if (!body?.title || typeof body.title !== 'string') return err(res, 400, 'VALIDATION_ERROR', 'body.title 必须是非空字符串');
        // 时间刻度：界面时间线只有 :00/:30 刻度，缺 time 的卡片会落进「全天」组
        const hhmm = typeof body.time === 'string' && HHMM_RE.test(body.time) ? body.time : null;
        const card = await store.createCard({
          content: body.title.trim(),
          type: 'task',
          done: false,
          assignedDate: typeof body.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due) ? body.due : null,
          time: hhmm,
          startTime: hhmm,
          endTime: hhmm ? addMinutes(hhmm, 30) : null,
          priority: body.priority,
          meta: provenanceForCreate(body.provenance),
        }, { idPrefix: 'c_mt_' });
        return ok(res, cardToTodo(card));
      }
      if (todoMatch && method === 'PUT') {
        const patch = {};
        if (body?.title !== undefined) patch.content = String(body.title).trim();
        if (body?.done !== undefined) patch.done = Boolean(body.done);
        if (body?.priority !== undefined) patch.priority = body.priority;
        if (body?.due !== undefined) patch.assignedDate = (typeof body.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due)) ? body.due : null;
        if (body?.time !== undefined) {
          const hhmm = typeof body.time === 'string' && HHMM_RE.test(body.time) ? body.time : null;
          patch.time = hhmm;
          patch.startTime = hhmm;
          patch.endTime = hhmm ? addMinutes(hhmm, 30) : null;
        }
        const existingTodo = await store.getCard(todoMatch[1]);
        const fallbackProject = existingTodo?.meta?.updatedBy?.project ?? existingTodo?.meta?.createdBy?.project ?? null;
        patch.meta = provenanceForUpdate(existingTodo?.meta ?? null, body?.provenance, fallbackProject);
        const card = await store.updateCard(todoMatch[1], patch);
        if (!card) return err(res, 404, 'NOT_FOUND', `TODO ${todoMatch[1]} not found`);
        return ok(res, cardToTodo(card));
      }
      if (todoMatch && method === 'DELETE') {
        const removed = await store.deleteCard(todoMatch[1]);
        if (!removed) return err(res, 404, 'NOT_FOUND', `TODO ${todoMatch[1]} not found`);
        return ok(res, null);
      }

      // ── Sync (extension push, deprecated) ────────────
      if (path === '/api/sync/todos' && method === 'PUT') {
        // 已废弃：todos 统一为 task cards，忽略旧的全量 todos 推送，避免双数据源复活
        const cards = await store.listCards();
        return ok(res, cards.filter(c => c.type === 'task').map(cardToTodo));
      }

      // ── Sync (host ↔ remote) ─────────────────────────
      if (path === '/api/sync/status' && method === 'GET') {
        return ok(res, await syncStatus(store));
      }
      if (path === '/api/sync/config' && method === 'GET') {
        const settings = await store.getSettings();
        return ok(res, maskSyncConfig(settings.sync ?? { provider: 'off' }));
      }
      if (path === '/api/sync/config' && method === 'PUT') {
        const settings = await store.getSettings();
        const next = mergeSyncConfig(settings.sync ?? {}, body ?? {});
        await store.setSettings({ sync: next });
        return ok(res, maskSyncConfig(next));
      }
      if (path === '/api/sync/test' && method === 'POST') {
        const settings = await store.getSettings();
        try {
          const backplane = createBackplane(settings.sync ?? {});
          return ok(res, await backplane.test());
        } catch (e) {
          return err(res, 400, 'SYNC_CONFIG', e.message);
        }
      }
      if (path === '/api/sync/now' && method === 'POST') {
        const direction = body?.direction ?? 'auto';
        const settings = await store.getSettings();
        const provider = settings.sync?.provider ?? 'off';
        const r = await handleSync(store, provider, direction);
        if (!r.ok) return err(res, r.status, r.code, r.message);
        return ok(res, r.result);
      }

      // ── Heatmap ───────────────────────────────────────
      if (path === '/api/heatmap' && method === 'GET') {
        const journals = await store.getJournals();
        const heatmap = {};
        for (const [day, entry] of Object.entries(journals)) {
          const content = (typeof entry === 'object' && entry !== null) ? (entry.content ?? '') : (entry ?? '');
          heatmap[day] = content.length > 0 ? 1 : 0;
        }
        return ok(res, heatmap);
      }

      // ── Settings ──────────────────────────────────────
      if (path === '/api/settings' && method === 'GET') {
        return ok(res, await store.getSettings());
      }
      if (path === '/api/settings' && method === 'PUT') {
        return ok(res, await store.setSettings(body ?? {}));
      }

      // ── Health ────────────────────────────────────────
      if (path === '/api/health') {
        return ok(res, { status: 'running', dataFile: store.file, store: store.kind });
      }

      // ── Skills（本机 skills 清单）─────────────────────
      if (path === '/api/skills' && method === 'GET') {
        return ok(res, scanSkills());
      }
      if (path === '/api/skill-status' && method === 'GET') {
        return ok(res, checkSkillStatus());
      }

      return err(res, 404, 'NOT_FOUND', `${method} ${path} not found`);
    } catch (e) {
      log.error(`request failed ${method} ${path}: ${e.message}`);
      return err(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

/* ─── 启动 ────────────────────────────────────────────── */

/**
 * 启动 host 服务。
 * @param {{port?:number, host?:string, dataDir?:string, logger?:object}} [opts]
 */
export async function startServer({ port = Number(process.env.JOURNAL_PORT) || DEFAULT_PORT, host = DEFAULT_HOST, dataDir, logger } = {}) {
  const log = logger ?? createLogger('server');
  const dir = dataDir ?? process.env.JOURNAL_DATA_DIR ?? join(__dirname, 'data');
  const store = await createStore({
    file: join(dir, 'journal.db'),
    jsonFile: join(dir, 'journal-data.json'),
    logger: createLogger('storage'),
  });
  const handle = await createApp(store, { logger: log });
  const server = createServer(handle);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const actualPort = server.address().port;
  log.info(`listening on ${host}:${actualPort}  store=${store.kind}  file=${store.file}`);
  return { server, store, port: actualPort, host, url: `http://${host}:${actualPort}` };
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  process.on('uncaughtException', (e) => console.error('[host][error] uncaught:', e));
  process.on('unhandledRejection', (e) => console.error('[host][error] unhandled rejection:', e));

  const { url, store } = await startServer({});
  console.log(`[journal] ${url}  数据: ${store.file}`);
}
