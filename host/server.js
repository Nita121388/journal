/**
 * server.js — Journal 本地 HTTP 服务端
 * 运行在 127.0.0.1:8765，数据持久化到 data/journal-data.json
 * 提供日志和 TODO 的 REST API，供扩展和 CLI 使用
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, 'data');
const DATA_FILE = join(DATA_DIR, 'journal-data.json');

const PORT  = 8765;
const HOST  = '127.0.0.1';

/* ─── 数据层 ────────────────────────────────────────── */

const DEFAULT_DATA = { journals: {}, todos: [], settings: { theme: 'auto' }, cards: [] };

mkdirSync(DATA_DIR, { recursive: true });

function readData() {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    writeData(DEFAULT_DATA);
    return structuredClone(DEFAULT_DATA);
  }
}

/** @param {object} data */
function writeData(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function todayKey() { return new Date().toISOString().slice(0, 10); }

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
      writeData(data);
      return ok(res, data.journals[key]);
    }
    if (dayMatch && method === 'DELETE') {
      delete data.journals[dayMatch[1]];
      writeData(data);
      return ok(res, null);
    }

    // ── Todos ─────────────────────────────────────────
    if (path === '/api/todos' && method === 'GET') {
      return ok(res, data.todos);
    }
    if (path === '/api/todos' && method === 'POST') {
      if (!body?.title || typeof body.title !== 'string') return err(res, 400, 'VALIDATION_ERROR', 'body.title 必须是非空字符串');
      const todo = {
        id: crypto.randomUUID(),
        title: body.title.trim(),
        done: false,
        priority: ['high', 'medium', 'low'].includes(body.priority) ? body.priority : 'medium',
        due: typeof body.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due) ? body.due : null,
      };
      data.todos.unshift(todo);
      writeData(data);
      return ok(res, todo);
    }
    if (todoMatch && method === 'PUT') {
      const idx = data.todos.findIndex(t => t.id === todoMatch[1]);
      if (idx === -1) return err(res, 404, 'NOT_FOUND', `TODO ${todoMatch[1]} not found`);
      const t = data.todos[idx];
      if (body?.title   !== undefined) t.title   = String(body.title).trim();
      if (body?.done    !== undefined) t.done    = Boolean(body.done);
      if (body?.priority !== undefined && ['high', 'medium', 'low'].includes(body.priority)) t.priority = body.priority;
      if (body?.due !== undefined) {
        t.due = (typeof body.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due)) ? body.due : null;
      }
      writeData(data);
      return ok(res, t);
    }
    if (todoMatch && method === 'DELETE') {
      const before = data.todos.length;
      data.todos = data.todos.filter(t => t.id !== todoMatch[1]);
      if (data.todos.length === before) return err(res, 404, 'NOT_FOUND', `TODO ${todoMatch[1]} not found`);
      writeData(data);
      return ok(res, null);
    }

    // ── Sync (extension push) ────────────────────────
    if (path === '/api/sync/todos' && method === 'PUT') {
      if (!Array.isArray(body?.todos)) return err(res, 400, 'VALIDATION_ERROR', 'body.todos 必须是数组');
      data.todos = body.todos;
      writeData(data);
      return ok(res, data.todos);
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
