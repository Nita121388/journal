/**
 * store.js — 扩展数据读写桥接层
 * 新架构：host 为权威源，扩展编辑直接写 host（通过 host-sync.js）。
 * 扩展缓存（chrome.storage.local）只在启动时从 host 拉取，后续不再写入。
 */

import { saveJournalToHost, saveTodosToHost } from './host-sync.js';

const KEY = Object.freeze({
  JOURNALS: 'journals',
  TODOS: 'todos',
  SETTINGS: 'settings',
});

const STORAGE_VERSION = 1;

/* ─── 内部归一化 ────────────────────────────────────────── */

/**
 * 归一化单条日志：兼容旧格式 string + 新格式对象
 * @param {string|{content:string,createdAt?:string,updatedAt?:string}} entry
 * @returns {string} 日志内容（纯 markdown）
 */
function contentOf(entry) {
  if (entry == null) return '';
  if (typeof entry === 'string') return entry;
  return entry.content ?? '';
}

function isJournalMap(val) {
  return val !== null && typeof val === 'object' && Object.values(val).every(v => {
    if (typeof v === 'string') return true;
    return v !== null && typeof v === 'object' && typeof v.content === 'string';
  });
}

function isTodoArray(val) {
  if (!Array.isArray(val)) return false;
  return val.every(t =>
    typeof t === 'object' &&
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    typeof t.done === 'boolean'
  );
}

/* ─── 读取（从缓存） ────────────────────────────────────── */

/** @returns {Promise<Record<string, any>>} 原始 journals 数据（可能含旧/新格式） */
export async function getAllJournalsRaw() {
  const { [KEY.JOURNALS]: raw } = await chrome.storage.local.get(KEY.JOURNALS);
  if (!isJournalMap(raw)) return {};
  return raw;
}

/** @returns {Promise<Record<string, string>>} 归一化后的 journals（dayKey → markdown 内容） */
export async function getAllJournals() {
  const raw = await getAllJournalsRaw();
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = contentOf(v);
  }
  return out;
}

/**
 * 获取某一天的 journal 内容
 * @param {string} dayKey
 * @returns {Promise<string>}
 */
export async function getJournal(dayKey) {
  const all = await getAllJournals();
  return all[dayKey] ?? '';
}

/**
 * 获取热力图数据（返回 dayKey → 字符串内容）
 * @returns {Promise<Record<string, string>>}
 */
export async function getJournalsForHeatmap() {
  return getAllJournals();
}

/**
 * 订阅 journals 变更（外部同步触发时刷新缓存）
 */
export function subscribeJournals(cb) {
  const listener = changes => {
    if (changes.journals) {
      const all = changes.journals.newValue || {};
      const normalized = {};
      for (const [k, v] of Object.entries(all)) {
        normalized[k] = contentOf(v);
      }
      cb(normalized);
    }
  };
  chrome.storage.local.onChanged.addListener(listener);
  return () => chrome.storage.local.onChanged.removeListener(listener);
}

/* ─── 写入（直接写 host 权威层） ────────────────────────── */

/**
 * 保存某一天的 journal（直接写 host 权威层 + 同步更新缓存）
 * @param {string} dayKey
 * @param {string} markdown
 * @returns {Promise<void>}
 */
export async function saveJournal(dayKey, markdown) {
  if (typeof dayKey !== 'string' || !dayKey) throw new Error('dayKey required');
  if (typeof markdown !== 'string') throw new Error('markdown must be string');
  // 写 host 权威层
  const ok = await saveJournalToHost(dayKey, markdown);
  if (!ok) throw new Error('saveJournalToHost failed');
  // 同步更新缓存（让 UI 实时显示新数据）
  const { [KEY.JOURNALS]: journals = {} } = await chrome.storage.local.get(KEY.JOURNALS);
  journals[dayKey] = markdown; // 缓存仍用旧格式 string（渲染时 contentOf 兼容）
  await chrome.storage.local.set({ [KEY.JOURNALS]: journals });
}

/**
 * 删除某一天的 journal（通过 PUT 空内容到 host + 更新缓存）
 * @param {string} dayKey
 * @returns {Promise<void>}
 */
export async function deleteJournal(dayKey) {
  await saveJournal(dayKey, '');
}

/* ─── Todos（写 host 权威层） ──────────────────────────── */

export async function getTodos() {
  const { [KEY.TODOS]: raw } = await chrome.storage.local.get(KEY.TODOS);
  if (!isTodoArray(raw)) return [];
  return raw;
}

export async function saveTodos(todos) {
  if (!isTodoArray(todos)) throw new Error('invalid todos');
  await saveTodosToHost(todos);
  // 同步更新缓存
  await chrome.storage.local.set({ [KEY.TODOS]: todos });
}

/* ─── Settings（本地存储，不涉及 host） ──────────────────── */

export async function getSettings() {
  const { [KEY.SETTINGS]: raw } = await chrome.storage.local.get(KEY.SETTINGS);
  return {
    sync: { enabled: false, provider: '', endpoint: '', ...(raw?.sync || {}) },
    ai:   { provider: 'local', apiKey: '', ...(raw?.ai || {}) },
    theme: raw?.theme ?? 'auto',
  };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const merged = {
    sync:   { ...current.sync,   ...patch.sync   },
    ai:     { ...current.ai,     ...patch.ai     },
    theme:  patch.theme ?? current.theme,
  };
  await chrome.storage.local.set({ [KEY.SETTINGS]: merged });
}
