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

/**
 * 本地写入代号（单调递增）。
 *
 * 用途：拉取/轮询是异步的，响应可能在本地写入之后才到 —— 那种响应已是陈旧快照。
 * 调用方在发起请求前记下本值，响应到达时若已变化就丢弃，避免用旧数据覆盖刚保存的内容。
 */
let writeSeq = 0;

/** @returns {number} 当前写入代号 */
export function getWriteSeq() {
  return writeSeq;
}

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
  writeSeq++;
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
  writeSeq++;
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
  // 合并前剔掉 undefined：JSON 传输会丢掉它（host 保留旧值），
  // 但内存/缓存若留着 undefined，会让界面按“无值”渲染（如进度/时长徽标消失）。
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const merged = { ...card, ...clean };
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) cards = [...cards, merged];
  else cards = cards.map((c) => (c.id === id ? { ...c, ...merged } : c));
  writeSeq++;
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
  writeSeq++;
  await persistCards();
  notify();
}

/**
 * 撤销删除：用删除前的快照重建一张卡。
 *
 * 注：host 的建卡接口不接受外部 id，故新卡的 id 与 `createdAt` 会变（内容/标题/
 * 状态/进度/优先级/排程/标签/属性/项目/emoji 全部保留）。墓碑语义仍成立：
 * 删除照样传播，恢复相当于新建。
 * @param {object} card 删除前的卡片快照
 * @returns {Promise<object>} 新卡片
 */
export async function restoreCardEntry(card) {
  return await createCardEntry({
    content: card.content,
    type: card.type,
    title: card.title,
    status: card.status,
    progress: card.progress,
    duration: card.duration,
    props: card.props,
    project: card.project,
    assignedDate: card.assignedDate,
    time: card.time,
    startTime: card.startTime,
    endTime: card.endTime,
    priority: card.priority,
    tags: card.tags,
    emoji: card.emoji,
    provenance: {
      origin: 'human',
      project: card.meta?.updatedBy?.project ?? card.meta?.createdBy?.project ?? undefined,
    },
  });
}

/* ─── 类型 ─────────────────────────────────────────────── */

/**
 * @typedef {import('../shared/model.js').Card} Card
 * @typedef {(cards: Card[]) => void} CardsListener
 */
