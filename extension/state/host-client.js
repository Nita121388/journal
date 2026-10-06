/**
 * host-client.js — host HTTP 契约客户端（state 层）
 *
 * 所有对 host 的 HTTP 调用集中于此；UI 层不得自行拼 URL。
 * 路由常量来自 `shared/protocol.js`（唯一真相），传输经平台端口 `getPort().hostFetch`。
 *
 * 约定：本层只做「请求 + 包络解包 + 错误归一」，不持有状态。
 */

import { getPort } from '../platform/index.js';
import { ROUTES, routes } from '../shared/protocol.js';

/**
 * 原始 host 调用（返回 `{ok,data}` / `{ok:false,error}` 包络）。
 * @param {'GET'|'PUT'|'POST'|'DELETE'} method
 * @param {string} path
 * @param {object|null} [body]
 */
export function hostApi(method, path, body = null) {
  return getPort().hostFetch(method, path, body);
}

/* ─── Cards ───────────────────────────────────────────── */

/**
 * 拉取全部卡片；host 离线返回 null（区别于「空数组」）。
 * @returns {Promise<import('../shared/protocol.js').Card[]|null>}
 */
export async function listCards() {
  const r = await hostApi('GET', ROUTES.cards);
  return r.ok ? (r.data ?? []) : null;
}

/**
 * @param {object} patch
 * @returns {Promise<{ok:true, card:object}|{ok:false, error:object}>}
 */
export async function createCardToHost(patch) {
  const r = await hostApi('POST', ROUTES.cards, patch);
  return r.ok ? { ok: true, card: r.data } : { ok: false, error: r.error };
}

/**
 * @param {string} id
 * @param {object} patch
 */
export async function updateCardToHost(id, patch) {
  const r = await hostApi('PUT', routes.card(id), patch);
  return r.ok ? { ok: true, card: r.data } : { ok: false, error: r.error };
}

/** @param {string} id */
export async function deleteCardFromHost(id) {
  const r = await hostApi('DELETE', routes.card(id));
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/* ─── Journals / TODOs（旧接口，供缓存与导出） ─────────── */

/** @returns {Promise<Record<string, unknown>|null>} */
export async function listJournals() {
  const r = await hostApi('GET', ROUTES.journals);
  return r.ok ? (r.data ?? {}) : null;
}

/** @returns {Promise<unknown[]|null>} */
export async function listTodos() {
  const r = await hostApi('GET', ROUTES.todos);
  return r.ok ? (r.data ?? []) : null;
}

/** @param {string} dayKey @param {string} markdown */
export async function saveJournalToHost(dayKey, markdown) {
  const r = await hostApi('PUT', routes.journal(dayKey), { markdown });
  return r.ok;
}

/** @param {unknown[]} todos */
export async function saveTodosToHost(todos) {
  const r = await hostApi('PUT', ROUTES.syncTodos, { todos });
  return r.ok;
}

/* ─── 健康 / AI 配置 ──────────────────────────────────── */
// 说明：设置页曾直接 `fetch(`${HOST}/api/...`)`，绕过端口契约（桌面版/测试
// 无法替换传输层）。现全部收进这里。

/**
 * 健康探测。
 * @returns {Promise<object|null>} host 离线 / 超时 → null
 */
export async function checkHealth() {
  const r = await hostApi('GET', ROUTES.health);
  return r.ok ? r.data : null;
}

/**
 * AI provider 元数据（含建议模型、是否需要 key）。
 * @returns {Promise<object|null>}
 */
export async function getAiProviders() {
  const r = await hostApi('GET', ROUTES.aiProviders);
  return r.ok ? r.data : null;
}

/**
 * AI 配置（密钥已由 host 脱敏，只回 `apiKeySet` 标记）。
 * @returns {Promise<object|null>}
 */
export async function getAiConfig() {
  const r = await hostApi('GET', ROUTES.aiConfig);
  return r.ok ? r.data : null;
}

/**
 * 保存 AI 配置。
 * @param {object} patch
 * @returns {Promise<{ok:true, data:object}|{ok:false, error:object}>}
 */
export async function saveAiConfig(patch) {
  const r = await hostApi('PUT', ROUTES.aiConfig, patch);
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error };
}

/* ─── 本机配置 meta ───────────────────────────────────── */

/**
 * 读取 host 本机配置（模板 / 命名视图 / 属性库）。
 * @param {'savedViews'|'propertyLibrary'|'templates'} kind
 * @returns {Promise<any|null>} host 离线 / 未设过 → null
 */
export async function getHostMeta(kind) {
  const r = await hostApi('GET', routes.meta(kind));
  return r.ok ? r.data : null;
}

/**
 * 写入 host 本机配置，返回保存后的值。
 *
 * **失败必须抛错**（而不是静默返回 null）：否则调用方会弹出"已保存"并继续，
 * 而用户刷新后发现数据根本没变甚至被覆盖。
 * @param {'savedViews'|'propertyLibrary'|'templates'} kind
 * @param {any} value
 * @throws {Error} host 离线或写入被拒
 */
export async function setHostMeta(kind, value) {
  const r = await hostApi('PUT', routes.meta(kind), value);
  if (!r.ok) throw new Error(r.error?.message || '本机服务未连接，未保存');
  return r.data;
}

/**
 * 安全地「读 → 改 → 写」host meta。
 *
 * 关键不变量：**读取失败时绝不拿空值当基线写回**。
 * 旧写法 `(await getHostMeta(k)) || []` 在 host 离线时得到 `[]`，
 * 再写回“新增一条”就会把用户原有的全部模板/视图**覆盖成一条**，
 * 而 UI 还弹「已保存」。
 *
 * @param {'savedViews'|'propertyLibrary'|'templates'} kind
 * @param {(current: any) => any} mutate 基于当前值产出新值
 * @returns {Promise<any>} 保存后的值
 * @throws {Error} 读取或写入失败（调用方必须提示用户，不得当成功）
 */
export async function updateHostMeta(kind, mutate) {
  const current = await getHostMeta(kind);
  if (current === null) {
    throw new Error('本机服务未连接，无法读取已有数据（为避免覆盖，本次不保存）');
  }
  const next = mutate(current);
  return await setHostMeta(kind, next);
}

/* ─── 同步（host /api/sync/*） ────────────────────────── */

/** 读取同步状态；host 离线返回 null。 */
export async function getSyncStatus() {
  const r = await hostApi('GET', ROUTES.syncStatus);
  return r.ok ? r.data : null;
}

/**
 * 手动触发一次同步。
 * @param {'auto'|'push'|'pull'} [direction='auto']
 * @throws {Error} host 离线 / 未配置 provider / 传输失败
 */
export async function syncNow(direction = 'auto') {
  const r = await hostApi('POST', ROUTES.syncNow, { direction });
  if (!r.ok) throw new Error(r.error?.message || '同步失败');
  return r.data;
}

/** 读取同步配置（密钥已脱敏）；host 离线返回 null。 */
export async function getSyncConfig() {
  const r = await hostApi('GET', ROUTES.syncConfig);
  return r.ok ? r.data : null;
}

/**
 * 保存同步配置。密钥字段留空表示「不修改」。
 * @param {object} config — { provider, local?, webdav?, github? }
 */
export async function saveSyncConfig(config) {
  const r = await hostApi('PUT', ROUTES.syncConfig, config);
  if (!r.ok) throw new Error(r.error?.message || '保存同步配置失败');
  return r.data;
}

/** 连接测试当前 provider。 */
export async function testSync() {
  const r = await hostApi('POST', ROUTES.syncTest);
  if (!r.ok) throw new Error(r.error?.message || '连接测试失败');
  return r.data;
}

/**
 * 兼容旧接口：按天比较本地与远程。
 * @param {Record<string, string>} local
 * @param {Record<string, string>} remote
 * @returns {Record<string, 'local'|'remote'|'same'>}
 */
export function diffLocalRemote(local, remote) {
  const out = {};
  for (const day of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    if (local[day] === remote[day]) out[day] = 'same';
    else out[day] = remote[day] ? 'remote' : 'local';
  }
  return out;
}
