/**
 * sync.js — 扩展示图层的同步入口
 *
 * 真正的同步（SQLite 权威库 + 可插拔 Backplane + LWW 合并）由 **host** 执行，
 * 扩展只负责触发与展示：本模块是 host `/api/sync/*` 的薄封装。
 * 依赖图：sync.js → host-sync.js
 */

import { hostApi } from './host-sync.js';

/**
 * 读取同步状态（provider、是否开启、lastSyncAt、deviceId）。
 * host 离线时返回 null。
 * @returns {Promise<{provider:string, enabled:boolean, deviceId:string, lastSyncAt:string|null}|null>}
 */
export async function getSyncStatus() {
  const res = await hostApi('GET', '/api/sync/status');
  return res.ok ? res.data : null;
}

/**
 * 手动触发一次同步。
 * @param {'auto'|'push'|'pull'} [direction='auto']
 * @returns {Promise<object>} host 的同步结果
 * @throws {Error} host 离线 / 未配置 provider / 传输失败
 */
export async function syncNow(direction = 'auto') {
  const res = await hostApi('POST', '/api/sync/now', { direction });
  if (!res.ok) throw new Error(res.error?.message || '同步失败');
  return res.data;
}

/** 读取同步配置（密钥已脱敏，只带 *Set 标记）。host 离线返回 null */
export async function getSyncConfig() {
  const res = await hostApi('GET', '/api/sync/config');
  return res.ok ? res.data : null;
}

/**
 * 保存同步配置。密钥字段留空表示「不修改」。
 * @param {object} config — { provider, local?, webdav?, github? }
 */
export async function saveSyncConfig(config) {
  const res = await hostApi('PUT', '/api/sync/config', config);
  if (!res.ok) throw new Error(res.error?.message || '保存同步配置失败');
  return res.data;
}

/** 连接测试当前 provider */
export async function testSync() {
  const res = await hostApi('POST', '/api/sync/test');
  if (!res.ok) throw new Error(res.error?.message || '连接测试失败');
  return res.data;
}

/**
 * 兼容旧接口：按天比较本地与远程（保留，供演进式合并视图使用）
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
