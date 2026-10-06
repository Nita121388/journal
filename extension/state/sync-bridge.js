/**
 * sync-bridge.js — host ⇄ 本地真源的同步编排（state 层）
 *
 * 把历史上分离的三条路径（启动 pull / 20s 轮询 / storage.onChanged）合并为
 * **一条通知链**：fetch → 内容签名去重 → repository.hydrate → 持久化缓存 → onChange。
 *
 * - 启动：pullFromHost()（host 离线时降级到本地缓存，保证可离线查看）
 * - 运行：startHostSync() 定时比对内容签名，只有真正变化才通知重渲染
 *
 * 历史 no-op/死代码（startPushListener / normalizeEntry / newerEntry）已删除。
 */

import { getPort } from '../platform/index.js';
import * as host from './host-client.js';
import * as repo from './repository.js';

/**
 * 拉取 host 全量数据。
 * - 成功：灌入真源 + 覆盖缓存，返回 `{pulled:true}`
 * - host 离线：回退缓存（含旧格式迁移），返回 `{pulled:false}`
 *
 * 保持既有语义：三个端点**全部成功**才视为拉取成功（避免半残状态覆盖缓存）。
 * @returns {Promise<{pulled:boolean}>}
 */
export async function pullFromHost() {
  const [cards, journals, todos] = await Promise.all([
    host.listCards(),
    host.listJournals(),
    host.listTodos(),
  ]);

  if (cards === null || journals === null || todos === null) {
    console.debug('[sync-bridge] host offline → fallback to cache');
    await repo.hydrateFromCache();
    return { pulled: false };
  }

  repo.hydrate(cards);
  await getPort().storageSet({ cards, journals, todos });
  return { pulled: true };
}

/**
 * 定时从 host 拉取（默认 20s）。仅当内容签名变化时更新真源并回调，
 * 解决「已打开的侧栏看不到 CLI / agent 对 host 的写入」。
 *
 * @param {() => void} onChange — 检测到外部变化时触发（调用方负责重渲染）
 * @param {number} [intervalMs=20000]
 * @returns {number} setInterval id
 */
export function startHostSync(onChange, intervalMs = 20000) {
  let lastSig = null;

  const tick = async () => {
    const [cards, journals, todos] = await Promise.all([
      host.listCards(),
      host.listJournals(),
      host.listTodos(),
    ]);
    if (cards === null || journals === null || todos === null) return; // host 离线：保留当前真源

    const sig = JSON.stringify([cards, journals, todos]);
    // 首轮只建基线，不触发渲染（避免与 init 的首次全量渲染重复）
    if (lastSig === null) { lastSig = sig; return; }
    if (sig === lastSig) return;

    lastSig = sig;
    repo.hydrate(cards);
    await getPort().storageSet({ cards, journals, todos });
    onChange();
  };

  return setInterval(tick, intervalMs);
}
