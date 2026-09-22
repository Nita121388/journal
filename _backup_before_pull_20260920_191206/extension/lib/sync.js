/* ================================================================
   Journal — sync.js
   可插拔同步引擎。Provider 接口：pull() → remote state / push(state)。
   · webdav：扩展直接 fetch（坚果云等；需要用户授予站点权限）
   合并规则：LWW（updatedAt 新者胜）+ 墓碑传播（见 store.mergeFromRemote）
   ================================================================ */

'use strict';

import { getState, exportJson, mergeFromRemote, subscribe } from './store.js';
import { davBase, davPutFile, davGetFile, davTestConnection } from './webdav.js';
import { uid, nowIso } from './model.js';

/** 数据指纹：仅含会同步的业务字段，不含 sync 元信息 */
export function dataSignature(s = getState()) {
  const relevant = {
    days: s.days,
    todos: s.todos,
  };
  const json = JSON.stringify(relevant);
  const utf8 = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p) => String.fromCharCode(parseInt(p, 16)));
  return btoa(utf8);
}

let syncPromise = null;
let lastSyncAttemptAt = 0;
const SYNC_THROTTLE_MS = 2 * 60 * 1000;

export function getSyncStatus() {
  const state = getState();
  return {
    provider: state.settings.syncProvider,
    lastSyncAt: state.sync.lastSyncAt,
    deviceId: state.sync.deviceId,
  };
}

/**
 * 后台同步入口：同一时间只允许一个同步，短时间内重复触发直接复用/跳过。
 * force=true 供用户手动点击同步时使用。
 */
export function scheduleSync({ force = false } = {}) {
  if (syncPromise) return syncPromise;
  const now = Date.now();
  if (!force && now - lastSyncAttemptAt < SYNC_THROTTLE_MS) {
    return Promise.resolve({ skipped: true, reason: 'throttled' });
  }
  lastSyncAttemptAt = now;
  syncPromise = runSync('auto').finally(() => { syncPromise = null; });
  return syncPromise;
}

/* ─── Provider: webdav ───────────────────────────────────────── */

const webdavProvider = {
  async pull() {
    const { path } = davBase();
    const text = await davGetFile(path);
    return text == null ? null : JSON.parse(text);
  },
  async push() {
    const { path } = davBase();
    await davPutFile(path, exportJson());
    return { ok: true };
  },
  async test() {
    return davTestConnection();
  },
};

/* ─── 统一入口 ───────────────────────────────────────────────── */

function provider() {
  const p = getState().settings.syncProvider;
  if (p === 'webdav') return webdavProvider;
  return null;
}

/**
 * runSync(direction)  direction: 'push' | 'pull' | 'auto'
 * auto = pull → merge → 有变更即 push
 */
export async function runSync(direction = 'auto') {
  const prov = provider();
  if (!prov) throw new Error('同步未开启：请在设置里选择 Provider');

  const result = { direction, merged: null, pushed: false };
  const st = getState();
  const sigBefore = dataSignature();

  if (direction !== 'push') {
    const remote = await prov.pull();
    if (remote) {
      const mergeResult = await mergeFromRemote(remote);
      result.merged = mergeResult.stats || mergeResult;
      result.conflicts = mergeResult.conflicts || [];
    }
  }
  if (direction !== 'pull') {
    const sigAfter = dataSignature();
    const mergeChanged = sigBefore !== sigAfter;
    const hasPendingLocalChanges = !st.sync.lastSyncedSig || st.sync.lastSyncedSig !== sigAfter;
    if (direction === 'push' || mergeChanged || hasPendingLocalChanges) {
      await prov.push();
      result.pushed = true;
    } else {
      result.pushed = false;
    }
  }

  const d = new Date();
  const today = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  const daily = { ...((getState()).sync?.dailySyncs || {}) };
  daily[today] = (daily[today] || 0) + 1;

  const patch = { dailySyncs: daily };
  if (result.pushed) patch.lastSyncedSig = dataSignature();
  const s = getState();
  s.sync = { ...s.sync, ...patch };
  await chrome.storage.local.set({ journal_state: s });

  return result;
}

/* ─── 自动同步调度 ───────────────────────────────────────────── */

/** 开启自动同步：数据变更后 30s 触发；每 30 分钟兜底 */
export function startAutoSync() {
  let timer = null;
  subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (getState().settings.syncProvider !== 'off') scheduleSync().catch(() => {});
    }, 30 * 1000);
  });

  chrome.alarms.create('journal_sync', { periodInMinutes: 30 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'journal_sync' && getState().settings.syncProvider !== 'off') {
      scheduleSync().catch(() => {});
    }
  });
}
