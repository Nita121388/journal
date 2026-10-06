/**
 * repository.js — 卡片内存真源（state 层，UI 读取的唯一数据入口）
 *
 * 职责边界：
 *   - 持有卡片内存数组：UI 读取**只走这里**，不再每次读平台 storage。
 *   - 提供查询（同步）：all / byDay。
 *   - 提供写入：先落 host（权威），成功后更新内存 + 平台 storage 缓存 + 通知订阅者。
 *   - 提供 hydrate（由 sync-bridge 灌入）与 subscribe（变更通知）。
 *
 * 明确不做：网络编排（见 sync-bridge.js）、host URL 拼接（见 host-client.js）。
 * 平台能力经 `getPort()`（platform/index.js 契约）。
 *
 * 注：本任务保持写入「await host 后再更新内存」（与既有行为一致），不引入乐观 UI，
 * 以避免在重构期新增竞态面。
 */

import { getPort } from '../platform/index.js';
import { createCard, getCardsByDate, migrateOldJournals, migrateOldTodos } from '../shared/model.js';
import * as host from './host-client.js';

const KEY = Object.freeze({ CARDS: 'cards', JOURNALS: 'journals', TODOS: 'todos' });

/** @type {import('../shared/protocol.js').Card[]} 内存真源 */
let cards = [];

/** @type {Set<(cards: object[]) => void>} */
const listeners = new Set();

function notify() {
  for (const cb of [...listeners]) {
    try { cb(cards); } catch (e) { console.error('[repository] listener failed:', e); }
  }
}

/**
 * 订阅真源变更。注意：这是**被动通知**，不负责重渲染时机（重渲染策略留在 UI 层）。
 * @param {(cards: object[]) => void} cb
 * @returns {() => void} 退订
 */
export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * 灌入真源（由 sync-bridge 在拉取/轮询后调用）。
 * @param {object[]} next
 */
export function hydrate(next) {
  cards = Array.isArray(next) ? next : [];
  notify();
}

/* ─── 查询（同步，内存） ───────────────────────────────── */

/** @returns {object[]} */
export function getAllCards() {
  return cards;
}

/**
 * 某天的卡片（按 time 升序，null time 排最后）。
 * @param {string} date — YYYY-MM-DD
 * @returns {object[]}
 */
export function getCardsByDay(date) {
  return getCardsByDate(cards, date);
}

/* ─── 缓存持久化 ───────────────────────────────────────── */

async function persistCards() {
  await getPort().storageSet({ [KEY.CARDS]: cards });
}

/** 兼容旧格式：journals / todos → 卡片数组（去重） */
function normalizeJournalsToCards(rawJournals, rawTodos, rawCards) {
  if (Array.isArray(rawCards) && rawCards.length) return rawCards;
  const migrated = [...migrateOldJournals(rawJournals), ...migrateOldTodos(rawTodos)];
  const seen = new Set();
  return migrated.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

/**
 * 从平台 storage 缓存回填真源（host 离线时的降级路径）。
 * 含旧 journals/todos → cards 迁移，保证历史数据可读。
 */
export async function hydrateFromCache() {
  const cached = await getPort().storageGet([KEY.CARDS, KEY.JOURNALS, KEY.TODOS]);
  const migrated = normalizeJournalsToCards(
    cached[KEY.JOURNALS],
    cached[KEY.TODOS],
    cached[KEY.CARDS],
  );
  hydrate(migrated);
  if (migrated.length && !Array.isArray(cached[KEY.CARDS])) {
    await persistCards();
  }
  return migrated;
}

/* ─── 写入（host 权威优先） ────────────────────────────── */

/**
 * 新建卡片。
 * @param {object} [patch]
 * @returns {Promise<object>} 保存后的卡片
 */
export async function createCardEntry(patch = {}) {
  const normalized = createCard(patch);
  const { ok, card: saved } = await host.createCardToHost({
    content: normalized.content,
    type: normalized.type,
    done: normalized.done,
    title: normalized.title,
    status: normalized.status,
    progress: normalized.progress,
    duration: normalized.duration,
    props: normalized.props,
    project: normalized.project,
    assignedDate: normalized.assignedDate,
    time: normalized.time,
    startTime: normalized.startTime ?? null,
    endTime: normalized.endTime ?? null,
    priority: normalized.priority,
    tags: normalized.tags,
    emoji: normalized.emoji,
    provenance: patch.provenance,
  });
  if (!ok) throw new Error('createCard failed');
  cards = [...cards, saved];
  await persistCards();
  notify();
  return saved;
}

/**
 * 更新卡片。
 *
 * 兜底：若 host 返回的卡片缺少本次 patch 的字段（如旧版 host 忽略 endTime），
 * 将 patch 合并回去，避免界面/缓存丢失已保存字段（防拖拽时长回弹）。
 * @param {string} id
 * @param {object} patch
 */
export async function updateCardEntry(id, patch) {
  const { ok, card } = await host.updateCardToHost(id, { ...patch, provenance: patch.provenance });
  if (!ok) throw new Error('updateCard failed');
  const merged = { ...card, ...patch };
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) cards = [...cards, merged];
  else cards = cards.map((c) => (c.id === id ? { ...c, ...merged } : c));
  await persistCards();
  notify();
  return merged;
}

/**
 * 删除卡片。
 * @param {string} id
 */
export async function deleteCardEntry(id) {
  const { ok } = await host.deleteCardFromHost(id);
  if (!ok) throw new Error('deleteCard failed');
  cards = cards.filter((c) => c.id !== id);
  await persistCards();
  notify();
}
