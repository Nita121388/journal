/**
 * store.js — 唯一可以调用 chrome.storage.local 的模块
 * 依赖图：store.js 导入 nothing（纯 storage 桥接）
 */

const KEY = Object.freeze({
  JOURNALS: 'journals',
  TODOS: 'todos',
  SETTINGS: 'settings',
});

const STORAGE_VERSION = 1;

/* ─── 内部验证 ────────────────────────────────────────── */

/**
 * @param {any} val
 * @returns {val is Record<string, string>}
 */
function isJournalMap(val) {
  return (
    val !== null &&
    typeof val === 'object' &&
    Object.values(val).every(v => typeof v === 'string')
  );
}

/**
 * @param {any} val
 * @returns {val is Array<{id:string, title:string, done:boolean, due:string|null, priority:string}>}
 */
function isTodoArray(val) {
  if (!Array.isArray(val)) return false;
  return val.every(
    t =>
      typeof t === 'object' &&
      typeof t.id === 'string' &&
      typeof t.title === 'string' &&
      typeof t.done === 'boolean'
  );
}

/* ─── 公开 API ────────────────────────────────────────── */

/**
 * 获取全部 journal 数据（dayKey → markdown）
 * @returns {Promise<Record<string, string>>}
 */
export async function getAllJournals() {
  const { [KEY.JOURNALS]: raw } = await chrome.storage.local.get(KEY.JOURNALS);
  if (!isJournalMap(raw)) return {};
  return raw;
}

/**
 * 获取某一天的 journal 条目
 * @param {string} dayKey — "YYYY-MM-DD"
 * @returns {Promise<string>} 条目内容，不存在返回空字符串
 */
export async function getJournal(dayKey) {
  const all = await getAllJournals();
  return all[dayKey] ?? '';
}

/**
 * 保存某一天的 journal 条目
 * @param {string} dayKey — "YYYY-MM-DD"
 * @param {string} markdown
 * @returns {Promise<void>}
 */
export async function saveJournal(dayKey, markdown) {
  if (typeof dayKey !== 'string' || !dayKey) throw new Error('dayKey required');
  if (typeof markdown !== 'string') throw new Error('markdown must be string');
  const all = await getAllJournals();
  all[dayKey] = markdown;
  await chrome.storage.local.set({ [KEY.JOURNALS]: all });
}

/**
 * 删除某一天的 journal 条目
 * @param {string} dayKey
 * @returns {Promise<void>}
 */
export async function deleteJournal(dayKey) {
  const all = await getAllJournals();
  delete all[dayKey];
  await chrome.storage.local.set({ [KEY.JOURNALS]: all });
}

/**
 * 订阅 journals 变更（外部写入如同步、后台写入时触发）
 * @param {(journals: Record<string, string>) => void} cb
 * @returns {() => void} 取消订阅函数
 */
export function subscribeJournals(cb) {
  const listener = changes => {
    if (changes.journals) {
      const all = changes.journals.newValue || {};
      if (isJournalMap(all)) cb(all);
    }
  };
  chrome.storage.local.onChanged.addListener(listener);
  return () => chrome.storage.local.onChanged.removeListener(listener);
}

/**
 * 获取热力图数据（全部 journals，供纯函数聚合）
 * @returns {Promise<Record<string, string>>}
 */
export async function getJournalsForHeatmap() {
  return getAllJournals();
}

/**
 * 获取全部 todos
 * @returns {Promise<Array<{id:string, title:string, done:boolean, due:string|null, priority:string}>>}
 */
export async function getTodos() {
  const { [KEY.TODOS]: raw } = await chrome.storage.local.get(KEY.TODOS);
  if (!isTodoArray(raw)) return [];
  return raw;
}

/**
 * 保存全部 todos（完整替换）
 * @param {Array<{id:string, title:string, done:boolean, due:string|null, priority:string}>} todos
 * @returns {Promise<void>}
 */
export async function saveTodos(todos) {
  if (!isTodoArray(todos)) throw new Error('invalid todos');
  await chrome.storage.local.set({ [KEY.TODOS]: todos });
}

/**
 * 获取 settings（含默认值）
 * @returns {Promise<{sync:{enabled:boolean, provider:string, endpoint:string}, ai:{provider:string, apiKey:string}, theme:string}>}
 */
export async function getSettings() {
  const { [KEY.SETTINGS]: raw } = await chrome.storage.local.get(KEY.SETTINGS);
  return {
    sync: { enabled: false, provider: '', endpoint: '', ...(raw?.sync || {}) },
    ai:   { provider: 'local', apiKey: '', ...(raw?.ai || {}) },
    theme: raw?.theme ?? 'auto',
  };
}

/**
 * 保存 settings（合并写入，不覆盖未传字段）
 * @param {Partial<{sync:object, ai:object, theme:string}>} patch
 * @returns {Promise<void>}
 */
export async function saveSettings(patch) {
  const current = await getSettings();
  const merged = {
    sync:   { ...current.sync,   ...patch.sync   },
    ai:     { ...current.ai,     ...patch.ai     },
    theme:  patch.theme ?? current.theme,
  };
  await chrome.storage.local.set({ [KEY.SETTINGS]: merged });
}
