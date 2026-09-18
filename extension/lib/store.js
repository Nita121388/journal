/**
 * store.js — 扩展数据读写桥接层
 * 新架构：host 为权威源，扩展编辑直接写 host（通过 host-sync.js）。
 * 扩展缓存（chrome.storage.local）只在启动时从 host 拉取，后续不再写入。
 */

import {
  saveJournalToHost, saveTodosToHost,
  createCardToHost, updateCardToHost, deleteCardFromHost,
} from './host-sync.js';
import {
  createCard, migrateOldJournals, migrateOldTodos,
  getCardsByDate, getCardPool,
} from './model.js';

const KEY = Object.freeze({
  CARDS: 'cards',
  JOURNALS: 'journals',
  TODOS: 'todos',
  SETTINGS: 'settings',
});

const STORAGE_VERSION = 2;

/* ─── 内部归一化 ────────────────────────────────────────── */

/** 兼容旧格式：journals dayKey → string|object → 卡片数组 */
function normalizeJournalsToCards(rawJournals, rawTodos, rawCards) {
  if (Array.isArray(rawCards) && rawCards.length) return rawCards;
  const migrated = [
    ...migrateOldJournals(rawJournals),
    ...migrateOldTodos(rawTodos),
  ];
  // 去重（按 id）
  const seen = new Set();
  return migrated.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

/* ─── 读取（从缓存） ────────────────────────────────────── */

/**
 * 获取全部卡片（含迁移逻辑）
 * @returns {Promise<Card[]>}
 */
export async function getAllCards() {
  const cached = await chrome.storage.local.get([KEY.CARDS, KEY.JOURNALS, KEY.TODOS]);
  const cards = cached[KEY.CARDS];
  if (Array.isArray(cards) && cards.length) return cards;
  // 缓存无卡片 → 尝试迁移旧数据
  const migrated = normalizeJournalsToCards(
    cached[KEY.JOURNALS],
    cached[KEY.TODOS],
    cards
  );
  if (migrated.length) {
    await chrome.storage.local.set({ [KEY.CARDS]: migrated });
  }
  return migrated;
}

/**
 * 获取某天的卡片
 * @param {string} date — YYYY-MM-DD
 * @returns {Promise<Card[]>}
 */
export async function getCardsByDay(date) {
  const all = await getAllCards();
  return getCardsByDate(all, date);
}

/**
 * 获取卡片池（未安排）
 * @returns {Promise<Card[]>}
 */
export async function getPoolCards() {
  const all = await getAllCards();
  return getCardPool(all);
}

/**
 * 获取热力图数据（dayKey → 卡片数）
 * @returns {Promise<Record<string, number>>}
 */
export async function getHeatmapData() {
  const all = await getAllCards();
  const out = {};
  for (const c of all) {
    if (!c.assignedDate) continue;
    out[c.assignedDate] = (out[c.assignedDate] || 0) + 1;
  }
  return out;
}

/* ─── 写入（直接写 host 权威层 + 同步缓存） ────────────────── */

/**
 * 新建卡片
 * @param {object} patch
 * @returns {Promise<Card>}
 */
export async function createCardEntry(patch = {}) {
  const card = createCard(patch);
  const { ok, card: saved } = await createCardToHost({
    content: card.content,
    type: card.type,
    done: card.done,
    assignedDate: card.assignedDate,
    time: card.time,
  });
  if (!ok) throw new Error('createCard failed');
  await addCardToCache(saved);
  return saved;
}

/** 把卡片加入缓存（追加） */
async function addCardToCache(card) {
  const { [KEY.CARDS]: cards = [] } = await chrome.storage.local.get(KEY.CARDS);
  cards.push(card);
  await chrome.storage.local.set({ [KEY.CARDS]: cards });
}

/**
 * 更新卡片
 * @param {string} id
 * @param {object} patch
 * @returns {Promise<Card>}
 */
export async function updateCardEntry(id, patch) {
  const { ok, card } = await updateCardToHost(id, patch);
  if (!ok) throw new Error('updateCard failed');
  await patchCardInCache(id, card);
  return card;
}

/** 更新缓存中某张卡片 */
async function patchCardInCache(id, newCard) {
  const { [KEY.CARDS]: cards = [] } = await chrome.storage.local.get(KEY.CARDS);
  const idx = cards.findIndex(c => c.id === id);
  if (idx === -1) {
    cards.push(newCard);
  } else {
    cards[idx] = { ...cards[idx], ...newCard };
  }
  await chrome.storage.local.set({ [KEY.CARDS]: cards });
}

/**
 * 删除卡片
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteCardEntry(id) {
  const { ok } = await deleteCardFromHost(id);
  if (!ok) throw new Error('deleteCard failed');
  const { [KEY.CARDS]: cards = [] } = await chrome.storage.local.get(KEY.CARDS);
  await chrome.storage.local.set({
    [KEY.CARDS]: cards.filter(c => c.id !== id),
  });
}

/* ─── 兼容旧接口（journals / todos 委托给 cards） ──────────── */

export async function getJournal(dayKey) {
  const dayCards = await getCardsByDay(dayKey);
  return dayCards.map(c => c.content).join('\n\n');
}

export async function getAllJournals() {
  const all = await getAllCards();
  const out = {};
  for (const c of all) {
    if (!c.assignedDate) continue;
    out[c.assignedDate] = (out[c.assignedDate] || '') + (out[c.assignedDate] ? '\n\n' : '') + c.content;
  }
  return out;
}

export async function getJournalsForHeatmap() {
  return getAllJournals();
}

export async function saveJournal(dayKey, markdown) {
  await saveJournalToHost(dayKey, markdown);
}

export async function deleteJournal(dayKey) {
  await saveJournalToHost(dayKey, '');
}

export async function getTodos() {
  const all = await getAllCards();
  return all
    .filter(c => c.type === 'task')
    .map(c => ({
      id: c.id,
      title: c.content,
      done: c.done,
      due: c.assignedDate,
      priority: c.type === 'task' ? 'medium' : 'low',
    }));
}

export async function saveTodos(todos) {
  await saveTodosToHost(todos);
}

export function subscribeJournals(cb) {
  const listener = changes => {
    if (changes.cards) {
      cb(changes.cards.newValue || []);
    }
  };
  chrome.storage.local.onChanged.addListener(listener);
  return () => chrome.storage.local.onChanged.removeListener(listener);
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
