/**
 * sync.js — 同步引擎骨架（WebDAV / 本地文件，LWW 合并 + 删除墓碑）
 * 依赖图：sync.js → store.js
 */

import { getSettings } from './store.js';

/**
 * 手动触发一次同步（扩展弹窗/后台定时调用）
 * TODO: 后续实现 WebDAV / 本地文件读写 + LWW 合并 + 墓碑
 * @returns {Promise<{ok:boolean, synced:number}>}
 */
export async function syncNow() {
  const settings = await getSettings();
  if (!settings.sync.enabled) {
    console.debug('[sync] skipped: sync not enabled');
    return { ok: true, synced: 0 };
  }
  // TODO: 实际同步逻辑
  throw new Error('Sync not implemented yet');
}

/**
 * 比较本地与远程，返回差异摘要（演进式合并用）
 * TODO: 后续实现 LWW compare
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
