/**
 * host-sync.js — 扩展 ↔ host 服务同步桥接
 * 架构：host 文件为唯一权威源（source of truth），chrome.storage.local 为缓存层。
 * 
 * 同步协议：
 * - 启动时无条件从 host 拉取（覆盖缓存，LWW 合并）
 * - 扩展编辑直接写 host（通过 PUT /api/journals/{day}），不写 chrome.storage.local
 * - host 离线时缓存层独立可用，恢复后下次启动同步
 */

export const HOST = 'http://127.0.0.1:8765';

/* ─── HTTP 工具 ────────────────────────────────────── */

/**
 * @param {'GET'|'PUT'|'POST'|'DELETE'} method
 * @param {string} path
 * @param {object|null} body
 * @returns {Promise<{ok:boolean, data?:any, error?:{code:string,message:string}}>}
 */
export async function hostApi(method, path, body = null) {
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

/** 内部别名：其余函数沿用 `api(...)` */
const api = hostApi;

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
 * 从 host 无条件拉取 cards、journals、todos，覆盖 chrome.storage.local。
 * host 为权威源，缓存只是镜像。
 * @returns {Promise<{pulled:boolean}>}
 */
export async function pullFromHost() {
  const [cardRes, journalRes, todoRes] = await Promise.all([
    api('GET', '/api/cards'),
    api('GET', '/api/journals'),
    api('GET', '/api/todos'),
  ]);
  if (!cardRes.ok || !journalRes.ok || !todoRes.ok) {
    console.debug('[host-sync] pull skipped (offline or error):', cardRes.error || journalRes.error || todoRes.error);
    return { pulled: false };
  }
  const hostCards = cardRes.data || [];
  const hostJournals = journalRes.data || {};
  const hostTodos = todoRes.data || [];

  // 无条件拉取覆盖
  await chrome.storage.local.set({
    cards: hostCards,
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

/* ─── Cards 写入 ────────────────────────────────────────── */

/** 创建卡片到 host，返回 { ok, card } */
export async function createCardToHost(cardPatch) {
  const res = await api('POST', '/api/cards', cardPatch);
  return res.ok ? { ok: true, card: res.data } : { ok: false, error: res.error };
}

/** 更新 host 卡片，返回 { ok, card } */
export async function updateCardToHost(id, patch) {
  const res = await api('PUT', `/api/cards/${id}`, patch);
  return res.ok ? { ok: true, card: res.data } : { ok: false, error: res.error };
}

/** 删除 host 卡片，返回 { ok } */
export async function deleteCardFromHost(id) {
  const res = await api('DELETE', `/api/cards/${id}`);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/* ─── 监听器（适配新架构） ──────────────────────────────────── */

// 旧接口保留兼容：startPushListener 不再需要，调用方忽略即可
export function startPushListener() {
  // 新架构下无需监听 storage 变更推送（扩展编辑直接写 host）
  console.debug('[host-sync] startPushListener: no-op (new architecture)');
}

/* ─── 轮询同步（host → extension）：外部写入可见 ─────────── */

/**
 * 定时从 host 拉取（默认 20s）。只有当数据确实变化时才写入缓存并回调，
 * 解决「已打开的侧边栏看不到 CLI / agent 对 host 的写入」问题。
 * @param {() => void} onChange — 检测到外部变化时触发（调用方负责重渲染）
 * @param {number} [intervalMs=20000]
 * @returns {number} setInterval id
 */
export function startHostSync(onChange, intervalMs = 20000) {
  let lastSig = null;
  const tick = async () => {
    const [cardRes, journalRes, todoRes] = await Promise.all([
      api('GET', '/api/cards'),
      api('GET', '/api/journals'),
      api('GET', '/api/todos'),
    ]);
    if (!cardRes.ok || !journalRes.ok || !todoRes.ok) return; // host 离线：保留缓存

    const cards = cardRes.data || [];
    const journals = journalRes.data || {};
    const todos = todoRes.data || [];
    const sig = JSON.stringify([cards, journals, todos]);

    // 首轮只建基线，不触发渲染（避免与 init 的首次全量渲染重复）
    if (lastSig === null) { lastSig = sig; return; }
    if (sig === lastSig) return;

    lastSig = sig;
    await chrome.storage.local.set({ cards, journals, todos });
    onChange();
  };
  return setInterval(tick, intervalMs);
}
