/**
 * host-sync.js — 扩展 ↔ host 服务同步桥接
 * 架构：host 文件为唯一权威源（source of truth），chrome.storage.local 为缓存层。
 * 
 * 同步协议：
 * - 启动时无条件从 host 拉取（覆盖缓存，LWW 合并）
 * - 扩展编辑直接写 host（通过 PUT /api/journals/{day}），不写 chrome.storage.local
 * - host 离线时缓存层独立可用，恢复后下次启动同步
 */

const HOST = 'http://127.0.0.1:8765';

/* ─── HTTP 工具 ────────────────────────────────────── */

/**
 * @param {'GET'|'PUT'|'POST'|'DELETE'} method
 * @param {string} path
 * @param {object|null} body
 * @returns {Promise<{ok:boolean, data?:any, error?:{code:string,message:string}}>}
 */
async function api(method, path, body = null) {
  const url = `${HOST}${path}`;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(url, opts);
    return await res.json();
  } catch (e) {
    console.debug('[host-sync] host offline:', e.message);
    return { ok: false, error: { code: 'HOST_OFFLINE', message: e.message } };
  }
}

/* ─── 统一归一化：旧格式 string → 新格式对象 ──────────────── */

/** @param {string|{content:string,createdAt?:string,updatedAt?:string}} entry */
function normalizeEntry(entry) {
  if (typeof entry === 'string') {
    const now = new Date().toISOString();
    return { content: entry, createdAt: now, updatedAt: now };
  }
  return entry;
}

/** @param {string|{content:string,createdAt?:string,updatedAt?:string}} a @param {string|{content:string,createdAt?:string,updatedAt?:string}} b */
function newerEntry(a, b) {
  const na = normalizeEntry(a);
  const nb = normalizeEntry(b);
  return (na.updatedAt ?? '') >= (nb.updatedAt ?? '') ? na : nb;
}

/* ─── 拉取（host → extension）：启动时无条件覆盖缓存 ──────── */

/**
 * 从 host 无条件拉取 journals 和 todos，覆盖 chrome.storage.local。
 * host 为权威源，缓存只是镜像。
 * @returns {Promise<{pulled:boolean}>}
 */
export async function pullFromHost() {
  const [journalRes, todoRes] = await Promise.all([
    api('GET', '/api/journals'),
    api('GET', '/api/todos'),
  ]);
  if (!journalRes.ok || !todoRes.ok) {
    console.debug('[host-sync] pull skipped (offline or error):', journalRes.error || todoRes.error);
    return { pulled: false };
  }
  const hostJournals = journalRes.data || {};
  const hostTodos = todoRes.data || [];

  // 无条件拉取覆盖
  await chrome.storage.local.set({
    journals: hostJournals,
    todos: hostTodos,
  });
  console.debug('[host-sync] pulled from host (unconditional)');
  return { pulled: true };
}

/* ─── 写入（extension → host）：直接写权威层，不写缓存 ──────── */

/** 将某一天的 journal 直接写 host（权威层），返回 Promise<boolean> */
export async function saveJournalToHost(dayKey, markdown) {
  const res = await api('PUT', `/api/journals/${dayKey}`, { markdown });
  return res.ok;
}

/** 将 todos 全量写 host（权威层），返回 Promise<boolean> */
export async function saveTodosToHost(todos) {
  const res = await api('PUT', '/api/sync/todos', { todos });
  return res.ok;
}

/* ─── 监听器（适配新架构） ──────────────────────────────────── */

// 旧接口保留兼容：startPushListener 不再需要，调用方忽略即可
export function startPushListener() {
  // 新架构下无需监听 storage 变更推送（扩展编辑直接写 host）
  console.debug('[host-sync] startPushListener: no-op (new architecture)');
}
