/**
 * engine.js — 同步编排（transport 无关）
 *
 * 流程：pull → merge(LWW + 墓碑) → 持久化 → push（合并后全量，含墓碑，天然幂等）。
 * 通过传入的 backplane 决定介质；通过传入的 store 决定落地。二者互不感知。
 */

import { mergeCardSets } from './merge.js';
import { buildSnapshot } from './backplane.js';

const DIRECTIONS = ['auto', 'push', 'pull'];

/**
 * 执行一次同步。
 * @param {object} args
 * @param {object} args.store      — lib/storage.js 的 store
 * @param {object} args.backplane  — sync/backplane.js 的 Backplane
 * @param {'auto'|'push'|'pull'} [args.direction]
 * @param {string} [args.deviceId]
 * @returns {Promise<object>}
 */
export async function runSync({ store, backplane, direction = 'auto', deviceId } = {}) {
  if (!store) throw new Error('runSync: store required');
  if (!backplane) throw new Error('runSync: backplane required');
  const dir = DIRECTIONS.includes(direction) ? direction : 'auto';
  const dev = deviceId ?? await store.getDeviceId();

  const result = {
    direction: dir,
    provider: backplane.name,
    pulled: false,
    merged: null,
    conflicts: [],
    pushed: false,
    lastSyncAt: null,
  };

  if (dir !== 'push') {
    const remote = await backplane.pull();
    result.pulled = remote !== null;
    if (remote) {
      const local = await store.listAllCards();
      const { cards, stats, conflicts } = mergeCardSets(local, remote.cards ?? []);
      result.merged = stats;
      result.conflicts = conflicts;
      await store.applyMergedCards(cards);
    }
  }

  if (dir !== 'pull') {
    const snapshot = buildSnapshot(dev, await store.listAllCards());
    await backplane.push(snapshot);
    result.pushed = true;
  }

  const lastSyncAt = new Date().toISOString();
  await store.setMeta({
    deviceId: dev,
    lastSyncAt,
    lastDirection: dir,
    lastProvider: backplane.name,
  });
  result.lastSyncAt = lastSyncAt;
  return result;
}

/** 读取同步状态（供 /api/sync/status） */
export async function syncStatus(store) {
  const settings = await store.getSettings();
  const deviceId = await store.getDeviceId();
  const lastSyncAt = await store.getMeta('lastSyncAt');
  const lastProvider = await store.getMeta('lastProvider');
  const provider = settings.sync?.provider ?? 'off';
  return {
    provider,
    enabled: provider !== 'off',
    deviceId,
    lastSyncAt: lastSyncAt ?? null,
    lastProvider: lastProvider ?? null,
    lastDirection: (await store.getMeta('lastDirection')) ?? null,
  };
}
