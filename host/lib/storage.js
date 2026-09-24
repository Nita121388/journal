/**
 * storage.js — host 权威数据存储（SQLite，`node:sqlite`）
 *
 * 设计（见 .trellis/tasks/09-22-data-sync-engine/design.md）：
 * - cards 为唯一权威数据模型；journals 由 `c_mj_<day>` 卡片派生（无独立 journals 表）。
 * - 卡片带 `deleted`（删除墓碑）与 `updatedAt`（LWW 依据），供 sync/merge.js 合并。
 * - 首次启动从旧 `journal-data.json` 幂等迁移，迁移前自动备份。
 * - 运行环境无 `node:sqlite` 时回退到等价接口的 JSON 文件实现，保证 host 仍可用。
 *
 * 只依赖 node 内置模块，无第三方依赖。
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync,
  renameSync, copyFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLogger } from './logger.js';

const CARD_TYPES = ['text', 'task', 'idea'];
const PRIORITIES = ['high', 'medium', 'low'];
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const JOURNAL_PREFIX = 'c_mj_';

/* ─── 通用工具 ───────────────────────────────────────── */

export function nowIso() { return new Date().toISOString(); }

export function genId(prefix = 'c_') {
  if (prefix === 'c_mt_' || prefix === 'c_') {
    return prefix + Date.now() + '_' + randomUUID().slice(0, 8);
  }
  return prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function asString(v) { return typeof v === 'string' ? v : (v == null ? null : String(v)); }

/** 归一化标签数组：trim + 小写 + 去重 + 过滤空串 */
export function normalizeTags(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const t of input) {
    if (typeof t !== 'string') continue;
    const s = t.trim().toLowerCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** 归一化卡片：补默认值 + 约束枚举，兼容旧数据 */
export function normalizeCard(card = {}) {
  const start = asString(card.startTime) ?? asString(card.time) ?? null;
  return {
    id: card.id,
    content: typeof card.content === 'string' ? card.content : '',
    type: CARD_TYPES.includes(card.type) ? card.type : 'text',
    done: Boolean(card.done),
    assignedDate: asString(card.assignedDate),
    time: asString(card.time) ?? start,
    startTime: start,
    endTime: asString(card.endTime),
    priority: PRIORITIES.includes(card.priority) ? card.priority : 'medium',
    tags: normalizeTags(card.tags),
    meta: parseMetaCell(card.meta),
    createdAt: asString(card.createdAt) ?? nowIso(),
    updatedAt: asString(card.updatedAt) ?? nowIso(),
    deleted: Boolean(card.deleted),
  };
}

/** 解析 meta 单元格（JSON 字符串或对象） */
export function parseMetaCell(raw) {
  if (!raw || typeof raw === 'object') return raw ?? null;
  if (typeof raw !== 'string') return null;
  try {
    const v = JSON.parse(raw);
    return (v && typeof v === 'object') ? v : null;
  } catch { return null; }
}

/** 序列化 meta（undefined/null → null 存储） */
function metaToCell(meta) {
  if (!meta) return null;
  return JSON.stringify(meta);
}

/** 构造新卡片（生成 id + 时间戳），字段约束同 server 既有行为 */
export function buildCard(patch = {}, { idPrefix = 'c_' } = {}) {
  const now = nowIso();
  const start = asString(patch.startTime) ?? asString(patch.time) ?? null;
  return normalizeCard({
    id: patch.id ?? genId(idPrefix),
    content: typeof patch.content === 'string' ? patch.content : '',
    type: patch.type,
    done: patch.done,
    assignedDate: patch.assignedDate,
    time: patch.time ?? start,
    startTime: start,
    endTime: patch.endTime,
    priority: patch.priority,
    tags: patch.tags,
    meta: patch.meta,
    createdAt: patch.createdAt ?? now,
    updatedAt: patch.updatedAt ?? now,
    deleted: patch.deleted,
  });
}

/** 应用一次字段更新（server PUT 语义），返回新卡片 */
export function applyCardPatch(card, patch = {}) {
  const next = { ...card };
  if (patch.content !== undefined) next.content = String(patch.content);
  if (patch.type !== undefined && CARD_TYPES.includes(patch.type)) next.type = patch.type;
  if (patch.done !== undefined) next.done = Boolean(patch.done);
  if (patch.assignedDate !== undefined) next.assignedDate = asString(patch.assignedDate);
  if (patch.time !== undefined) next.time = asString(patch.time);
  if (patch.startTime !== undefined) next.startTime = asString(patch.startTime);
  if (patch.endTime !== undefined) next.endTime = asString(patch.endTime);
  if (patch.priority !== undefined && PRIORITIES.includes(patch.priority)) next.priority = patch.priority;
  if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);
  if (patch.meta !== undefined) next.meta = parseMetaCell(patch.meta);
  next.updatedAt = nowIso();
  return next;
}

export function validHHMM(v) { return typeof v === 'string' && HHMM_RE.test(v); }

/* ─── 公共接口约定 ─────────────────────────────────────
 * 两个实现（sqlite / json）都提供：
 *   init(), close()
 *   listCards(), listAllCards(), getCard(id), countCards()
 *   createCard(patch, opts), insertCard(card), updateCard(id, patch),
 *   deleteCard(id), applyMergedCards(cards)
 *   getJournals(), getJournal(day), setJournal(day, content), deleteJournal(day)
 *   getSettings(), setSettings(patch), getMeta(key), setMeta(obj), getDeviceId()
 *   exportJson()
 * ─────────────────────────────────────────────────────── */

const COLUMNS = [
  'id', 'content', 'type', 'done', 'assignedDate', 'time', 'startTime',
  'endTime', 'priority', 'tags', 'meta', 'createdAt', 'updatedAt', 'deleted',
];

function parseTagsCell(raw) {
  if (Array.isArray(raw)) return normalizeTags(raw);
  if (typeof raw !== 'string' || !raw) return [];
  try { return normalizeTags(JSON.parse(raw)); } catch { return []; }
}

function rowToCard(r) {
  return {
    id: r.id,
    content: r.content ?? '',
    type: r.type ?? 'text',
    done: Boolean(r.done),
    assignedDate: r.assignedDate ?? null,
    time: r.time ?? null,
    startTime: r.startTime ?? null,
    endTime: r.endTime ?? null,
    priority: r.priority ?? 'medium',
    tags: parseTagsCell(r.tags),
    meta: parseMetaCell(r.meta),
    createdAt: r.createdAt ?? null,
    updatedAt: r.updatedAt ?? null,
    deleted: Boolean(r.deleted),
  };
}

function cardToValues(c) {
  return [
    c.id, c.content ?? '', c.type ?? 'text', c.done ? 1 : 0,
    c.assignedDate ?? null, c.time ?? null, c.startTime ?? null,
    c.endTime ?? null, c.priority ?? 'medium',
    JSON.stringify(normalizeTags(c.tags)),
    metaToCell(c.meta),
    c.createdAt ?? null, c.updatedAt ?? null, c.deleted ? 1 : 0,
  ];
}

/** 除 tags/meta 外逐字段比对用（历史数据零丢失校验） */
const LOSS_FIELDS = [
  'content', 'type', 'done', 'assignedDate', 'time', 'startTime',
  'endTime', 'priority', 'createdAt', 'updatedAt', 'deleted',
];

export function cardsEqualExceptTags(a, b) {
  return LOSS_FIELDS.every(f => a?.[f] === b?.[f] || (a?.[f] == null && b?.[f] == null));
}

/**
 * 校验迁移后历史数据未丢失。
 * @param {Array} before 迁移前卡片快照（已含 id）
 * @param {Array} after 迁移后全量卡片
 * @returns {{ok:boolean, reason?:string}}
 */
export function verifyNoDataLoss(before, after) {
  const beforeIds = new Set(before.map(c => c.id));
  const afterIds = new Set(after.map(c => c.id));
  if (beforeIds.size !== afterIds.size) return { ok: false, reason: 'card count changed' };
  for (const id of beforeIds) {
    if (!afterIds.has(id)) return { ok: false, reason: `missing id ${id}` };
  }
  const afterMap = new Map(after.map(c => [c.id, c]));
  for (const prev of before) {
    const next = afterMap.get(prev.id);
    if (!cardsEqualExceptTags(prev, next)) return { ok: false, reason: `field mismatch ${prev.id}` };
  }
  return { ok: true };
}

/* ─── SQLite 实现 ────────────────────────────────────── */

function createSqliteStore(DatabaseSync, file, log) {
  const dbdir = dirname(file);
  if (dbdir) mkdirSync(dbdir, { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'text',
      done INTEGER NOT NULL DEFAULT 0,
      assignedDate TEXT,
      time TEXT,
      startTime TEXT,
      endTime TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      tags TEXT,
      meta TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_cards_assigned ON cards(assignedDate);
    CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const UPSERT = `INSERT INTO cards (${COLUMNS.join(',')}) VALUES (${COLUMNS.map(() => '?').join(',')})
    ON CONFLICT(id) DO UPDATE SET ${COLUMNS.slice(1).map(c => `${c}=excluded.${c}`).join(', ')}`;

  return {
    kind: 'sqlite',
    file,
    async init() {
      const cols = db.prepare('PRAGMA table_info(cards)').all().map(c => c.name);
      if (!cols.includes('tags')) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backup = `${file}.pre-tags-${stamp}.bak`;
        db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
        log.info(`tags migration backup: ${backup}`);
        db.exec('ALTER TABLE cards ADD COLUMN tags TEXT');
        const after = db.prepare('SELECT * FROM cards').all().map(rowToCard);
        const before = after.map(c => ({ ...c, tags: [] }));
        const check = verifyNoDataLoss(before, after);
        if (!check.ok) {
          log.error(`tags migration failed verification (${check.reason}); restoring backup`);
          db.close();
          copyFileSync(backup, file);
          throw new Error('迁移未改动数据');
        }
      }
      if (!cols.includes('meta')) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backup = `${file}.pre-meta-${stamp}.bak`;
        db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
        log.info(`meta migration backup: ${backup}`);
        db.exec('ALTER TABLE cards ADD COLUMN meta TEXT');
        const after = db.prepare('SELECT * FROM cards').all().map(rowToCard);
        const before = after.map(c => ({ ...c, meta: null }));
        const check = verifyNoDataLoss(before, after);
        if (!check.ok) {
          log.error(`meta migration failed verification (${check.reason}); restoring backup`);
          db.close();
          copyFileSync(backup, file);
          throw new Error('迁移未改动数据');
        }
      }
      return true;
    },
    async close() { try { db.close(); } catch { /* noop */ } },

    async countCards() {
      return db.prepare('SELECT COUNT(*) AS n FROM cards WHERE deleted = 0').get().n;
    },
    async listCards() {
      return db.prepare('SELECT * FROM cards WHERE deleted = 0 ORDER BY createdAt DESC, id DESC').all().map(rowToCard);
    },
    async listAllCards() {
      return db.prepare('SELECT * FROM cards ORDER BY createdAt ASC, id ASC').all().map(rowToCard);
    },
    async getCard(id) {
      const r = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
      return r ? rowToCard(r) : null;
    },
    async insertCard(card) {
      const c = normalizeCard({ ...card, id: card.id ?? genId('c_') });
      db.prepare(UPSERT).run(...cardToValues(c));
      return c;
    },
    async createCard(patch, opts) {
      const c = buildCard(patch, opts);
      db.prepare(UPSERT).run(...cardToValues(c));
      return c;
    },
    async updateCard(id, patch) {
      const r = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
      if (!r) return null;
      const next = applyCardPatch(rowToCard(r), patch);
      db.prepare(UPSERT).run(...cardToValues(next));
      return next;
    },
    async deleteCard(id) {
      const r = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
      if (!r || r.deleted) return false;
      const c = rowToCard(r);
      c.deleted = true;
      c.updatedAt = nowIso();
      db.prepare(UPSERT).run(...cardToValues(c));
      return true;
    },
    async applyMergedCards(cards) {
      const stmt = db.prepare(UPSERT);
      let n = 0;
      for (const card of cards) {
        if (!card?.id) continue;
        stmt.run(...cardToValues(normalizeCard(card)));
        n++;
      }
      return n;
    },

    async getJournals() {
      const rows = db.prepare('SELECT * FROM cards WHERE id LIKE ? AND deleted = 0').all(JOURNAL_PREFIX + '%');
      const out = {};
      for (const r of rows) {
        const c = rowToCard(r);
        out[c.id.slice(JOURNAL_PREFIX.length)] = { content: c.content, createdAt: c.createdAt, updatedAt: c.updatedAt };
      }
      return out;
    },
    async getJournal(day) {
      const r = db.prepare('SELECT * FROM cards WHERE id = ? AND deleted = 0').get(JOURNAL_PREFIX + day);
      if (!r) return '';
      const c = rowToCard(r);
      return { content: c.content, createdAt: c.createdAt, updatedAt: c.updatedAt };
    },
    async setJournal(day, content) {
      const now = nowIso();
      const existing = db.prepare('SELECT * FROM cards WHERE id = ?').get(JOURNAL_PREFIX + day);
      const prev = existing ? rowToCard(existing) : null;
      const card = normalizeCard({
        id: JOURNAL_PREFIX + day,
        content: String(content ?? ''),
        type: 'text',
        assignedDate: day,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
        deleted: false,
      });
      db.prepare(UPSERT).run(...cardToValues(card));
      return { content: card.content, createdAt: card.createdAt, updatedAt: card.updatedAt };
    },
    async deleteJournal(day) {
      const existing = db.prepare('SELECT * FROM cards WHERE id = ?').get(JOURNAL_PREFIX + day);
      if (!existing || existing.deleted) return false;
      const card = rowToCard(existing);
      card.deleted = true;
      card.updatedAt = nowIso();
      db.prepare(UPSERT).run(...cardToValues(card));
      return true;
    },

    async getSettings() {
      const out = defaultSettings();
      for (const { key, value } of db.prepare('SELECT key, value FROM settings').all()) {
        try { out[key] = JSON.parse(value); } catch { out[key] = value; }
      }
      return out;
    },
    async setSettings(patch = {}) {
      const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const [k, v] of Object.entries(patch)) stmt.run(k, JSON.stringify(v));
      return this.getSettings();
    },
    async getMeta(key) {
      const r = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
      if (!r) return null;
      try { return JSON.parse(r.value); } catch { return r.value; }
    },
    async setMeta(obj = {}) {
      const stmt = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const [k, v] of Object.entries(obj)) stmt.run(k, JSON.stringify(v));
    },
    async getDeviceId() {
      let id = await this.getMeta('deviceId');
      if (!id) { id = 'dev_' + randomUUID().slice(0, 8); await this.setMeta({ deviceId: id }); }
      return id;
    },
    async exportJson() { return exportJsonFrom(this); },
  };
}

/* ─── JSON 回退实现（无 node:sqlite 环境） ───────────── */

function createJsonStore(file, log) {
  let state = { cards: [], settings: {}, meta: {} };

  const persist = () => {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
    renameSync(tmp, file);
  };
  const findIdx = (id) => state.cards.findIndex(c => c.id === id);

  return {
    kind: 'json',
    file,
    async init() {
      if (existsSync(file)) {
        try {
          const raw = JSON.parse(readFileSync(file, 'utf-8'));
          state = { cards: raw.cards ?? [], settings: raw.settings ?? {}, meta: raw.meta ?? {} };
        } catch { log?.warn('json store corrupt, starting fresh'); }
      }
      return true;
    },
    async close() {},
    async countCards() { return state.cards.filter(c => !c.deleted).length; },
    async listCards() {
      return state.cards.filter(c => !c.deleted)
        .map(c => normalizeCard(c))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id));
    },
    async listAllCards() {
      return state.cards.map(c => normalizeCard(c))
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
    },
    async getCard(id) { const i = findIdx(id); return i === -1 ? null : normalizeCard(state.cards[i]); },
    async insertCard(card) {
      const c = normalizeCard({ ...card, id: card.id ?? genId('c_') });
      const i = findIdx(c.id);
      if (i === -1) state.cards.push(c); else state.cards[i] = c;
      persist();
      return c;
    },
    async createCard(patch, opts) { const c = buildCard(patch, opts); state.cards.push(c); persist(); return c; },
    async updateCard(id, patch) {
      const i = findIdx(id);
      if (i === -1) return null;
      const next = applyCardPatch(normalizeCard(state.cards[i]), patch);
      state.cards[i] = next; persist();
      return next;
    },
    async deleteCard(id) {
      const i = findIdx(id);
      if (i === -1 || state.cards[i].deleted) return false;
      state.cards[i] = { ...normalizeCard(state.cards[i]), deleted: true, updatedAt: nowIso() };
      persist();
      return true;
    },
    async applyMergedCards(cards) {
      let n = 0;
      for (const card of cards) {
        if (!card?.id) continue;
        const c = normalizeCard(card);
        const i = findIdx(c.id);
        if (i === -1) state.cards.push(c); else state.cards[i] = c;
        n++;
      }
      persist();
      return n;
    },
    async getJournals() {
      const out = {};
      for (const c of state.cards) {
        const card = normalizeCard(c);
        if (card.deleted || !card.id.startsWith(JOURNAL_PREFIX)) continue;
        out[card.id.slice(JOURNAL_PREFIX.length)] = { content: card.content, createdAt: card.createdAt, updatedAt: card.updatedAt };
      }
      return out;
    },
    async getJournal(day) {
      const i = findIdx(JOURNAL_PREFIX + day);
      if (i === -1 || state.cards[i].deleted) return '';
      const c = normalizeCard(state.cards[i]);
      return { content: c.content, createdAt: c.createdAt, updatedAt: c.updatedAt };
    },
    async setJournal(day, content) {
      const id = JOURNAL_PREFIX + day;
      const i = findIdx(id);
      const now = nowIso();
      const prev = i === -1 ? null : normalizeCard(state.cards[i]);
      const card = normalizeCard({
        id, content: String(content ?? ''), type: 'text', assignedDate: day,
        createdAt: prev?.createdAt ?? now, updatedAt: now, deleted: false,
      });
      if (i === -1) state.cards.push(card); else state.cards[i] = card;
      persist();
      return { content: card.content, createdAt: card.createdAt, updatedAt: card.updatedAt };
    },
    async deleteJournal(day) {
      const i = findIdx(JOURNAL_PREFIX + day);
      if (i === -1 || state.cards[i].deleted) return false;
      state.cards[i] = { ...normalizeCard(state.cards[i]), deleted: true, updatedAt: nowIso() };
      persist();
      return true;
    },
    async getSettings() { return { ...defaultSettings(), ...state.settings }; },
    async setSettings(patch = {}) { state.settings = { ...state.settings, ...patch }; persist(); return this.getSettings(); },
    async getMeta(key) { return state.meta[key] ?? null; },
    async setMeta(obj = {}) { state.meta = { ...state.meta, ...obj }; persist(); },
    async getDeviceId() {
      if (!state.meta.deviceId) { state.meta.deviceId = 'dev_' + randomUUID().slice(0, 8); persist(); }
      return state.meta.deviceId;
    },
    async exportJson() { return exportJsonFrom(this); },
  };
}

/* ─── 共享：导出 / 默认设置 ──────────────────────────── */

export function defaultSettings() {
  return { theme: 'auto', sync: { provider: 'off' } };
}

async function exportJsonFrom(store) {
  const cards = await store.listCards();
  const journals = await store.getJournals();
  const todos = cards.filter(c => c.type === 'task').map(c => ({
    id: c.id, title: c.content, done: c.done, due: c.assignedDate, priority: c.priority,
  }));
  const settings = await store.getSettings();
  return { journals, todos, cards, settings };
}

/* ─── 工厂 ───────────────────────────────────────────── */

export async function createStore({ file, jsonFile = null, forceJson = false, logger: log } = {}) {
  const log2 = log ?? createLogger('storage');
  let DatabaseSync = null;
  if (!forceJson) {
    try { ({ DatabaseSync } = await import('node:sqlite')); } catch { DatabaseSync = null; }
  }
  let store;
  if (DatabaseSync) {
    store = createSqliteStore(DatabaseSync, file, log2);
  } else {
    const jsonPath = file.endsWith('.json') ? file : `${file}.json`;
    log2.warn(`node:sqlite unavailable, using JSON store at ${jsonPath}`);
    store = createJsonStore(jsonPath, log2);
  }
  await store.init();
  if (jsonFile) await migrateLegacy(store, jsonFile, log2);
  return store;
}

/* ─── 旧 JSON 迁移 ───────────────────────────────────── */

/**
 * 从旧 `data/journal-data.json` 幂等迁移进新库。
 * - 已有卡片时不做整体覆盖，只补齐缺失的 `c_mj_*` / `c_mt_*` 派生卡片。
 * - 迁移前把旧文件备份为 `<file>.migrated.bak`（仅一次）。
 * @returns {Promise<{migrated:boolean, cards:number}>}
 */
export async function migrateLegacy(store, jsonFile, log = createLogger('storage')) {
  if (!existsSync(jsonFile)) return { migrated: false, cards: 0 };
  let raw;
  try { raw = JSON.parse(readFileSync(jsonFile, 'utf-8')); } catch {
    log.warn(`legacy json unreadable, skipped: ${jsonFile}`);
    return { migrated: false, cards: 0 };
  }

  const existing = new Set((await store.listAllCards()).map(c => c.id));
  const toInsert = [];

  // 1) 直接存在的 cards（新格式）
  if (Array.isArray(raw.cards)) {
    for (const c of raw.cards) {
      if (!c?.id || existing.has(c.id)) continue;
      toInsert.push(normalizeCard(c));
      existing.add(c.id);
    }
  }
  // 2) journals → c_mj_<day> 卡片
  if (raw.journals && typeof raw.journals === 'object') {
    for (const [day, entry] of Object.entries(raw.journals)) {
      const id = JOURNAL_PREFIX + day;
      if (existing.has(id)) continue;
      const content = typeof entry === 'string' ? entry : (entry?.content ?? '');
      if (typeof content !== 'string' || content === '') continue;
      toInsert.push(normalizeCard({
        id, content, type: 'text', assignedDate: day,
        createdAt: (typeof entry === 'object' && entry?.createdAt) || nowIso(),
        updatedAt: (typeof entry === 'object' && entry?.updatedAt) || nowIso(),
      }));
      existing.add(id);
    }
  }
  // 3) todos → c_mt_<id> 卡片
  if (Array.isArray(raw.todos)) {
    for (const t of raw.todos) {
      if (!t?.title) continue;
      const id = 'c_mt_' + (t.id ?? randomUUID());
      if (existing.has(id)) continue;
      toInsert.push(normalizeCard({
        id, content: t.title, type: 'task', done: Boolean(t.done),
        assignedDate: typeof t.due === 'string' ? t.due : null,
        priority: t.priority, createdAt: t.createdAt ?? nowIso(),
      }));
      existing.add(id);
    }
  }

  if (toInsert.length) await store.applyMergedCards(toInsert);
  if (raw.settings && typeof raw.settings === 'object') {
    // 旧设置优先于默认值，但仅补齐顶层键，避免覆盖用户新写入的项
    const current = await store.getSettings();
    await store.setSettings({ ...current, ...raw.settings });
  }

  const bak = `${jsonFile}.migrated.bak`;
  if (!existsSync(bak)) { try { copyFileSync(jsonFile, bak); } catch { /* noop */ } }

  log.info(`legacy migrated: ${toInsert.length} cards from ${jsonFile}`);
  return { migrated: toInsert.length > 0, cards: toInsert.length };
}
