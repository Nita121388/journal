/* ================================================================
   Journal — store.js
   数据层：state 存在 chrome.storage.local 的 "state" 键下。
   所有写操作走这里，保证墓碑删除、updatedAt 维护一致。
   ================================================================ */

'use strict';

import { uid, nowIso, emptyState, findDay } from './model.js';

const STATE_KEY = 'journal_state';

let state = null;
let initing = null;
const listeners = new Set();

/* ---------- 基础读写 ---------- */

export function init() {
  if (initing) return initing;
  initing = (async () => {
    const res = await chrome.storage.local.get(STATE_KEY);
    state = res[STATE_KEY] || emptyState();
    migrate(state);
    if (!state.sync.deviceId) {
      state.sync.deviceId = `dev_${Math.random().toString(36).slice(2, 10)}`;
      await persist();
    }
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[STATE_KEY]) {
        state = changes[STATE_KEY].newValue || emptyState();
        migrate(state);
        listeners.forEach(fn => fn(state));
      }
    });
    return state;
  })();
  return initing;
}

function migrate(s) {
  if (!s.schemaVersion) s.schemaVersion = 1;
  if (!Array.isArray(s.days)) s.days = [];
  if (!Array.isArray(s.todos)) s.todos = [];
  if (!s.settings) s.settings = emptyState().settings;
  if (!s.settings.webdav) s.settings.webdav = { server: '', user: '', password: '', path: 'journal/data.json' };
  if (!s.settings.hostPort) s.settings.hostPort = 23517;
  if (!s.settings.hostToken) s.settings.hostToken = '';
  if (!s.sync) s.sync = { deviceId: '', lastSyncAt: null, rev: 0, dailySyncs: {}, lastSyncedSig: '' };
  if (!s.sync.dailySyncs) s.sync.dailySyncs = {};
  if (!s.settings.aiProvider) s.settings.aiProvider = 'off';
}

async function persist() {
  await chrome.storage.local.set({ [STATE_KEY]: state });
}

/** 订阅变更（UI 实时刷新用） */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

/** 内部：确保 state 已加载 */
async function ensureReady() {
  if (!state) await init();
}

/* ---------- Day（每日日志） ---------- */

/**
 * 获取某天的日志内容（不存在返回 ''）
 */
export function getDayContent(dateStr) {
  const d = findDay(state.days, dateStr);
  return d ? d.content : '';
}

/**
 * 保存某天的日志。content 为空字符串且无历史 → 不建条目。
 * 返回 { created, content }
 */
export async function setDayContent(dateStr, content) {
  content = (content || '').replace(/\s+$/, '');
  const existing = state.days.find(d => d.date === dateStr && !d.deletedAt);
  if (!content) {
    // 清空：墓碑删除（同步安全），或直接移除从未同步过的新条目
    if (!existing) return { created: false, content: '' };
    if (!existing.synced) {
      state.days = state.days.filter(d => d.id !== existing.id);
    } else {
      existing.deletedAt = nowIso();
      existing.updatedAt = existing.deletedAt;
    }
    await persist();
    return { created: false, content: '' };
  }
  if (existing) {
    if (existing.deletedAt) {
      delete existing.deletedAt;   // 复活
    }
    existing.content = content;
    existing.updatedAt = nowIso();
    await persist();
    return { created: false, content };
  }
  const day = {
    id: uid('d'),
    date: dateStr,
    content,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    deletedAt: null,
  };
  state.days.push(day);
  await persist();
  return { created: true, content };
}

/** 该日期是否有记录（日志或待办） */
export function dayHasRecord(dateStr) {
  const d = findDay(state.days, dateStr);
  if (d && d.content.trim()) return true;
  return state.todos.some(t => !t.deletedAt && t.dueDate === dateStr);
}

/** 列出有记录的所有日期（热力图用） */
export function listRecordedDates() {
  const dates = new Set();
  for (const d of state.days) {
    if (!d.deletedAt && d.content.trim()) dates.add(d.date);
  }
  for (const t of state.todos) {
    if (!t.deletedAt && t.dueDate) dates.add(t.dueDate);
  }
  return dates;
}

/* ---------- Todo ---------- */

/**
 * 添加待办
 * { text, dueDate?, priority?: 'low'|'medium'|'high' }
 */
export async function addTodo({ text, dueDate = null, priority = 'medium' }) {
  text = (text || '').trim();
  if (!text) throw new Error('todo text required');
  const todo = {
    id: uid('t'),
    text,
    done: false,
    priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
    dueDate: dueDate || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    deletedAt: null,
  };
  state.todos.push(todo);
  await persist();
  return todo;
}

/** 切换完成状态 */
export async function toggleTodo(id) {
  const t = state.todos.find(x => x.id === id && !x.deletedAt);
  if (!t) return null;
  t.done = !t.done;
  t.updatedAt = nowIso();
  await persist();
  return t;
}

/** 更新待办字段 */
export async function updateTodo(id, patch) {
  const t = state.todos.find(x => x.id === id && !x.deletedAt);
  if (!t) return null;
  if (patch.text !== undefined) {
    t.text = String(patch.text).trim();
    if (!t.text) return null;
  }
  if (patch.done !== undefined) t.done = !!patch.done;
  if (patch.priority !== undefined && ['low', 'medium', 'high'].includes(patch.priority)) {
    t.priority = patch.priority;
  }
  if (patch.dueDate !== undefined) t.dueDate = patch.dueDate || null;
  t.updatedAt = nowIso();
  await persist();
  return t;
}

/** 墓碑删除 */
export async function deleteTodo(id) {
  const t = state.todos.find(x => x.id === id && !x.deletedAt);
  if (!t) return false;
  t.deletedAt = nowIso();
  t.updatedAt = t.deletedAt;
  await persist();
  return true;
}

/** 列出待办；filter: { dueDate?, done?, all? } */
export function listTodos({ dueDate = null, done, all = false } = {}) {
  let list = state.todos.filter(t => all || !t.deletedAt);
  if (dueDate) list = list.filter(t => t.dueDate === dueDate);
  if (done !== undefined) list = list.filter(t => t.done === done);
  const order = { high: 0, medium: 1, low: 2 };
  list.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  return list;
}

/* ---------- 导出 / 合并（同步用） ---------- */

/** 导出同步用 JSON（含墓碑） */
export function exportJson() {
  return JSON.stringify({
    schemaVersion: state.schemaVersion,
    days: state.days,
    todos: state.todos,
    sync: {
      deviceId: state.sync.deviceId,
      rev: state.sync.rev,
      lastSyncAt: state.sync.lastSyncAt,
    },
  });
}

/**
 * mergeFromRemote(remote)
 * 将远端状态合并进本地。LWW（updatedAt 新者胜）+ 墓碑传播。
 * 返回 { stats, conflicts }
 */
export async function mergeFromRemote(remote) {
  await ensureReady();
  const conflicts = [];
  const stats = { daysAdded: 0, daysMerged: 0, daysDeleted: 0, todosAdded: 0, todosMerged: 0, todosDeleted: 0 };

  const mergeList = (localList, remoteList, name, statsKey) => {
    const byId = new Map(localList.map(x => [x.id, x]));
    const localIds = new Set(byId.keys());
    for (const r of remoteList) {
      const l = byId.get(r.id);
      if (!l) {
        localList.push(r);
        stats[statsKey + 'Added']++;
      } else if (r.updatedAt !== l.updatedAt) {
        // 双端都改过 → 冲突，LWW（updatedAt 新者胜）
        if (r.updatedAt > l.updatedAt) {
          conflicts.push({ id: r.id, type: name, local: l.updatedAt, remote: r.updatedAt, winner: 'remote' });
          Object.assign(l, r);
          stats[statsKey + 'Merged']++;
        } else {
          conflicts.push({ id: r.id, type: name, local: l.updatedAt, remote: r.updatedAt, winner: 'local' });
        }
      }
    }
    // 远端墓碑删除传播：本地存活项在远端已删 → 本地也删（墓碑时间取自远端）
    for (const r of remoteList) {
      if (!r.deletedAt) continue;
      const l = byId.get(r.id);
      if (!l || l.deletedAt) continue;
      if (!l.updatedAt || r.updatedAt >= l.updatedAt) {
        l.deletedAt = r.deletedAt;
        l.updatedAt = r.updatedAt;
        stats[statsKey + 'Deleted']++;
      }
      // 本地 updatedAt 更新 → 视为本地在删除前已修改并保留（复活优先）
    }
  };

  mergeList(state.days, remote.days || [], 'day', 'days');
  mergeList(state.todos, remote.todos || [], 'todo', 'todos');

  state.sync.rev = Math.max(state.sync.rev || 0, remote.sync?.rev || 0) + 1;
  state.sync.lastSyncAt = nowIso();
  await persist();
  return { stats, conflicts };
}
