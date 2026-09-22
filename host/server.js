/**
 * server.js — Journal 本地 HTTP 服务端
 * 运行在 127.0.0.1:8765，数据持久化到 data/journal-data.json
 * 提供日志和 TODO 的 REST API，供扩展和 CLI 使用
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, 'data');
const DATA_FILE = join(DATA_DIR, 'journal-data.json');

const PORT  = 8765;
const HOST  = '127.0.0.1';

// skills 物理目录（junction 指向 skillshare）。可用环境变量覆盖
const SKILLS_DIR = process.env.JOURNAL_SKILLS_DIR || 'C:\\Users\\chemclin\\AppData\\Roaming\\skillshare\\skills';

/* ─── 数据层 ────────────────────────────────────────── */

const DEFAULT_DATA = { journals: {}, todos: [], settings: { theme: 'auto' }, cards: [] };

mkdirSync(DATA_DIR, { recursive: true });

/** 旧 todos 迁移为 cards 的 id 前缀（幂等，重复迁移不会产生副本） */
const TODO_CARD_PREFIX = 'c_mt_';

/** 旧 journals 迁移为 cards 的 id 前缀（固定为 `c_mj_<dayKey>`，天然幂等） */
const JOURNAL_CARD_PREFIX = 'c_mj_';

/**
 * 把 legacy `data.journals` 迁移为 text cards（host 唯一数据模型为 cards）。
 *
 * 为什么需要：扩展侧 `store.js#getAllCards()` 只在【缓存无卡片】时才调用
 * `migrateOldJournals()`；一旦缓存里已有 cards 就直接 return，**永不重新迁移**。
 * 而 host 原先只迁移了 todos，没有迁移 journals，导致
 * `PUT /api/journals/:day`（CLI `write` 走这条路）写入的内容 UI 完全看不到。
 *
 * 幂等：已存在 `c_mj_<day>` 卡片时跳过。**不清空 `data.journals`**
 * （CLI `read`/`GET /api/journals/:day` 仍依赖它）。
 * @param {object} data
 * @returns {boolean} 是否有改动（需要落盘）
 */
function migrateLegacyJournals(data) {
  if (!data.journals || typeof data.journals !== 'object') return false;
  data.cards ??= [];
  const ids = new Set(data.cards.map(c => c.id));
  const now = new Date().toISOString();
  let changed = false;
  for (const [day, entry] of Object.entries(data.journals)) {
    const content = typeof entry === 'string' ? entry : entry?.content;
    if (typeof content !== 'string' || !content) continue;
    const id = JOURNAL_CARD_PREFIX + day;
    if (ids.has(id)) continue;
    data.cards.unshift({
      id,
      content,
      type: 'text',
      done: false,
      assignedDate: day,
      time: null,
      startTime: null,
      endTime: null,
      priority: 'medium',
      createdAt: (typeof entry === 'object' && entry?.createdAt) || now,
      updatedAt: (typeof entry === 'object' && entry?.updatedAt) || now,
    });
    ids.add(id);
    changed = true;
  }
  return changed;
}

/**
 * 写入/更新某天的日志卡片（保证 UI 能读到；与 `data.journals` 双写）。
 * @param {object} data
 * @param {string} day  YYYY-MM-DD
 * @param {string} content
 * @param {string} now  ISO 时间戳
 */
function upsertJournalCard(data, day, content, now) {
  data.cards ??= [];
  const id = JOURNAL_CARD_PREFIX + day;
  const idx = data.cards.findIndex(c => c.id === id);
  if (idx === -1) {
    data.cards.unshift({
      id,
      content,
      type: 'text',
      done: false,
      assignedDate: day,
      time: null,
      startTime: null,
      endTime: null,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
    });
    return;
  }
  const card = data.cards[idx];
  card.content = content;
  card.assignedDate = day;
  card.updatedAt = now;
}

/**
 * 把 legacy `data.todos` 迁移为 task cards（host 唯一数据模型为 cards）。
 * 幂等：已存在 `c_mt_<todoId>` 卡片时跳过；迁移后清空 todos。
 * @param {object} data
 * @returns {boolean} 是否有改动（需要落盘）
 */
function migrateLegacyTodos(data) {
  if (!Array.isArray(data.todos) || data.todos.length === 0) return false;
  data.cards ??= [];
  const ids = new Set(data.cards.map(c => c.id));
  const now = new Date().toISOString();
  for (const t of data.todos) {
    if (!t || typeof t.title !== 'string' || !t.title.trim()) continue;
    const id = TODO_CARD_PREFIX + t.id;
    if (ids.has(id)) continue;
    data.cards.unshift({
      id,
      content: t.title,
      type: 'task',
      done: Boolean(t.done),
      assignedDate: typeof t.due === 'string' ? t.due : null,
      time: null,
      startTime: null,
      endTime: null,
      priority: ['high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium',
      createdAt: t.createdAt ?? now,
      updatedAt: now,
    });
    ids.add(id);
  }
  data.todos = [];
  return true;
}

/** task card → todo 视图（CLI / 旧接口兼容） */
function cardToTodo(c) {
  return {
    id: c.id,
    title: c.content,
    done: Boolean(c.done),
    priority: ['high', 'medium', 'low'].includes(c.priority) ? c.priority : 'medium',
    due: c.assignedDate ?? null,
  };
}

/** 本地时区日期 key（不用 toISOString，避免 UTC+8 凌晨偏移一天） */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readData() {
  try {
    const data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
    const todosMigrated = migrateLegacyTodos(data);
    const journalsMigrated = migrateLegacyJournals(data);
    if (todosMigrated || journalsMigrated) writeData(data);
    return data;
  } catch {
    writeData(DEFAULT_DATA);
    return structuredClone(DEFAULT_DATA);
  }
}

/** @param {object} data */
function writeData(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
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

function ok(res, data)   { return json(res, 200, { ok: true, data }); }
function err(res, status, code, message) { return json(res, status, { ok: false, error: { code, message } }); }

/* ─── skills 扫描 ────────────────────────────────────────── */

function findSkillMd(dir) {
  // 优先自己目录下，其次一级子目录，最多递归两层
  const cands = [join(dir, 'SKILL.md')];
  let sub;
  try { for (const n of readdirSync(dir)) {
    sub = join(dir, n, 'SKILL.md');
    if (statSyncSafe(sub)) { cands.push(sub); break; }
  } } catch {}
  for (const p of cands) if (statSyncSafe(p)) return p;
  return null;
}
function statSyncSafe(p) {
  try { return (statSync(p)?.isFile && statSync(p).isFile()) ? true : null; } catch { return null; }
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
      try { isDir = statSync(dir).isDirectory(); } catch {}
      if (!isDir) return null;
      const skillMd = findSkillMd(dir);
      const { name: n2, description } = parseSkillFrontmatter(skillMd ?? join(dir, 'SKILL.md'));
      return {
        name: n2 || name,
        slug: name,
        installed: true,
        dir,
        skillMd: skillMd ?? null,
        description: description.slice(0, 200),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { dir: SKILLS_DIR, exists: true, skills };
}

/* ─── journal skill 安装状态检测 ────────────────────────── */

const SKILL_NAME = 'journal';
const PROJECT_DIR = 'E:\\projects\\journal';
// 用户级各平台 skills 目录（junction 指向 skillshare）
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
  return {
    name: SKILL_NAME,
    installed: installedCount > 0,
    installedCount,
    total: detail.length,
    locations: detail,
  };
}
/** @returns {Promise<{method:string, path:string, body:object|null}>} */
function parseReq(req) {
  return new Promise((resolve, reject) => {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
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

/* ─── 路由 ────────────────────────────────────────────── */

async function handle(req, res) {
  const { method, path, body, query } = await parseReq(req);

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const data = readData();
  const dayMatch = path.match(/^\/api\/journals\/(\d{4}-\d{2}-\d{2})$/);
  const todoMatch = path.match(/^\/api\/todos\/([\w-]+)$/);
  const cardMatch = path.match(/^\/api\/cards\/([\w-]+)$/);

  try {
    // ── Cards ────────────────────────────────────────
    if (path === '/api/cards' && method === 'GET') {
      return ok(res, data.cards ?? []);
    }
    if (path === '/api/cards' && method === 'POST') {
      if (typeof body?.content !== 'string') return err(res, 400, 'VALIDATION_ERROR', 'body.content 必须是字符串');
      const now = new Date().toISOString();
      const card = {
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        content: body.content,
        type: ['text', 'task', 'idea'].includes(body.type) ? body.type : 'text',
        done: Boolean(body.done),
        assignedDate: typeof body.assignedDate === 'string' ? body.assignedDate : null,
        time: typeof body.time === 'string' ? body.time : null,
        startTime: typeof body.startTime === 'string' ? body.startTime : (typeof body.time === 'string' ? body.time : null),
        endTime: typeof body.endTime === 'string' ? body.endTime : null,
        priority: ['high', 'medium', 'low'].includes(body.priority) ? body.priority : 'medium',
        createdAt: now,
        updatedAt: now,
      };
      (data.cards ??= []).unshift(card);
      writeData(data);
      return ok(res, card);
    }
    if (cardMatch && method === 'PUT') {
      const idx = (data.cards ?? []).findIndex(c => c.id === cardMatch[1]);
      if (idx === -1) return err(res, 404, 'NOT_FOUND', `Card ${cardMatch[1]} not found`);
      const card = data.cards[idx];
      if (body?.content !== undefined) card.content = String(body.content);
      if (body?.type !== undefined && ['text', 'task', 'idea'].includes(body.type)) card.type = body.type;
      if (body?.done !== undefined) card.done = Boolean(body.done);
      if (body?.assignedDate !== undefined) card.assignedDate = typeof body.assignedDate === 'string' ? body.assignedDate : null;
      if (body?.time !== undefined) card.time = typeof body.time === 'string' ? body.time : null;
      if (body?.startTime !== undefined) card.startTime = typeof body.startTime === 'string' ? body.startTime : null;
      if (body?.endTime !== undefined) card.endTime = typeof body.endTime === 'string' ? body.endTime : null;
      if (body?.priority !== undefined && ['high', 'medium', 'low'].includes(body.priority)) card.priority = body.priority;
      card.updatedAt = new Date().toISOString();
      writeData(data);
      return ok(res, card);
    }
    if (cardMatch && method === 'DELETE') {
      const before = (data.cards ?? []).length;
      data.cards = (data.cards ?? []).filter(c => c.id !== cardMatch[1]);
      if (data.cards.length === before) return err(res, 404, 'NOT_FOUND', `Card ${cardMatch[1]} not found`);
      writeData(data);
      return ok(res, null);
    }
    // ── Journals ──────────────────────────────────────
    if (path === '/api/journals' && method === 'GET') {
      return ok(res, data.journals);
    }
    if (dayMatch && method === 'GET') {
      return ok(res, data.journals[dayMatch[1]] ?? '');
    }
    if (dayMatch && method === 'PUT') {
      const key = dayMatch[1];
      if (typeof body?.markdown !== 'string') return err(res, 400, 'VALIDATION_ERROR', 'body.markdown 必须是字符串');
      const existing = data.journals[key];
      const now = new Date().toISOString();
      // 兼容旧格式：existing 可能是字符串或对象
      const existingObj = (typeof existing === 'object' && existing !== null) ? existing : null;
      data.journals[key] = {
        content: body.markdown,
        createdAt: existingObj?.createdAt ?? now,
        updatedAt: now,
      };
      // 同步到 cards，否则扩展（UI）读不到：
      // 扩展侧只在缓存为空时迁移 journals，此后永不再迁移。
      upsertJournalCard(data, key, body.markdown, now);
      writeData(data);
      return ok(res, data.journals[key]);
    }
    if (dayMatch && method === 'DELETE') {
      delete data.journals[dayMatch[1]];
      data.cards = (data.cards ?? []).filter(c => c.id !== JOURNAL_CARD_PREFIX + dayMatch[1]);
      writeData(data);
      return ok(res, null);
    }

    // ── Todos ─────────────────────────────────────────
    if (path === '/api/todos' && method === 'GET') {
      return ok(res, (data.cards ?? []).filter(c => c.type === 'task').map(cardToTodo));
    }
    if (path === '/api/todos' && method === 'POST') {
      if (!body?.title || typeof body.title !== 'string') return err(res, 400, 'VALIDATION_ERROR', 'body.title 必须是非空字符串');
      const now = new Date().toISOString();
      const card = {
        id: TODO_CARD_PREFIX + crypto.randomUUID(),
        content: body.title.trim(),
        type: 'task',
        done: false,
        assignedDate: typeof body.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due) ? body.due : null,
        time: null,
        startTime: null,
        endTime: null,
        priority: ['high', 'medium', 'low'].includes(body.priority) ? body.priority : 'medium',
        createdAt: now,
        updatedAt: now,
      };
      (data.cards ??= []).unshift(card);
      writeData(data);
      return ok(res, cardToTodo(card));
    }
    if (todoMatch && method === 'PUT') {
      const card = (data.cards ?? []).find(c => c.id === todoMatch[1]);
      if (!card) return err(res, 404, 'NOT_FOUND', `TODO ${todoMatch[1]} not found`);
      if (body?.title !== undefined) card.content = String(body.title).trim();
      if (body?.done !== undefined) card.done = Boolean(body.done);
      if (body?.priority !== undefined && ['high', 'medium', 'low'].includes(body.priority)) card.priority = body.priority;
      if (body?.due !== undefined) {
        card.assignedDate = (typeof body.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due)) ? body.due : null;
      }
      card.updatedAt = new Date().toISOString();
      writeData(data);
      return ok(res, cardToTodo(card));
    }
    if (todoMatch && method === 'DELETE') {
      const before = (data.cards ?? []).length;
      data.cards = (data.cards ?? []).filter(c => c.id !== todoMatch[1]);
      if (data.cards.length === before) return err(res, 404, 'NOT_FOUND', `TODO ${todoMatch[1]} not found`);
      writeData(data);
      return ok(res, null);
    }

    // ── Sync (extension push) ────────────────────────
    if (path === '/api/sync/todos' && method === 'PUT') {
      // 已废弃：todos 统一为 task cards，忽略旧的全量 todos 推送，避免双数据源复活
      return ok(res, (data.cards ?? []).filter(c => c.type === 'task').map(cardToTodo));
    }

    // ── Heatmap ───────────────────────────────────────
    if (path === '/api/heatmap' && method === 'GET') {
      const heatmap = {};
      for (const [day, entry] of Object.entries(data.journals)) {
        // 兼容新旧格式：值可能是字符串或 { content } 对象
        const content = (typeof entry === 'object' && entry !== null) ? (entry.content ?? '') : (entry ?? '');
        heatmap[day] = content.length > 0 ? 1 : 0;
      }
      return ok(res, heatmap);
    }

    // ── Settings ──────────────────────────────────────
    if (path === '/api/settings' && method === 'GET') {
      return ok(res, data.settings);
    }
    if (path === '/api/settings' && method === 'PUT') {
      data.settings = { ...data.settings, ...body };
      writeData(data);
      return ok(res, data.settings);
    }

    // ── Health ────────────────────────────────────────
    if (path === '/api/health') {
      return ok(res, { status: 'running', dataFile: DATA_FILE });
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
    console.error('[server] error:', e);
    return err(res, 500, 'INTERNAL', 'Internal server error');
  }
}

/* ─── 启动 ────────────────────────────────────────────── */

const server = createServer(handle);
server.listen(PORT, HOST, () => {
  console.log(`[journal] http://${HOST}:${PORT}  数据: ${DATA_FILE}`);
});
