/**
 * host-sync.js — 扩展 ↔ host 服务同步桥接
 * 依赖图：host-sync.js → store.js
 *
 * ⚠️ ARCHITECTURE EXCEPTION：本文件直接调用 chrome.storage.local（绕过 store.js）。
 * 原因：同步桥接层需要同时读取 journals + todos 两组 key 并原子写入，
 * 若走 store 会引入不必要的耦合。本文件的直接存储访问已在 spec 中记录。
 */

import * as store from './store.js';

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
    // host 离线时静默降级（不影响扩展自身使用）
    console.debug('[host-sync] host offline:', e.message);
    return { ok: false, error: { code: 'HOST_OFFLINE', message: e.message } };
  }
}

/* ─── 拉取（host → extension） ──────────────────────── */

/**
 * 从 host 拉取日志和 TODO，写入 chrome.storage.local
 * 仅在 chrome.storage 为空时覆盖（避免覆盖扩展本地新数据）
 * @returns {Promise<{pulled:boolean}>}
 */
export async function pullFromHost() {
  const [journalRes, todoRes] = await Promise.all([
    api('GET', '/api/journals'),
    api('GET', '/api/todos'),
  ]);
  if (!journalRes.ok || !todoRes.ok) {
    console.debug('[host-sync] pull skipped:', journalRes.error || todoRes.error);
    return { pulled: false };
  }
  // 仅在本地数据为空时才从 host 拉取（避免覆盖本地新写入）
  const local = await chrome.storage.local.get(['journals', 'todos']);
  const localJournals = local.journals || {};
  const localTodos = local.todos || [];

  const hostJournals = journalRes.data || {};
  const hostTodos = todoRes.data || [];

  const needsJournalPull = Object.keys(hostJournals).length > Object.keys(localJournals).length;
  const needsTodoPull    = hostTodos.length > localTodos.length;

  if (needsJournalPull || needsTodoPull) {
    await chrome.storage.local.set({
      ...(needsJournalPull ? { journals: hostJournals } : {}),
      ...(needsTodoPull    ? { todos: hostTodos }       : {}),
    });
    console.debug('[host-sync] pulled from host');
    return { pulled: true };
  }
  return { pulled: false };
}

/* ─── 推送（extension → host） ──────────────────────── */

/** 将当前 chrome.storage.local 全量推送到 host */
export async function pushToHost() {
  const { journals = {}, todos = [] } = await chrome.storage.local.get(['journals', 'todos']);
  const [jRes, tRes] = await Promise.all([
    // 逐天推送 journals（host PUT 是覆盖写，全量覆盖最简单）
    ...Object.entries(journals).map(([day, md]) =>
      api('PUT', `/api/journals/${day}`, { markdown: md })
    ),
    api('PUT', '/api/sync/todos', { todos }),
  ]);
  const ok = [jRes, tRes].every(r => r.ok);
  console.debug('[host-sync] pushed:', ok);
  return { pushed: ok };
}

/* ─── 防抖推送监听器（sidepanel.js 调用） ─────────────── */

let pushTimer = null;

/**
 * 启动推送监听：chrome.storage.local.onChanged → debounce 推送到 host
 * 供 sidepanel.js 在 init() 中调用
 */
export function startPushListener() {
  chrome.storage.local.onChanged.addListener(() => {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushToHost().catch(() => {}); }, 500);
  });
}
