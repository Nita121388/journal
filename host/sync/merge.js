/**
 * merge.js — 纯合并引擎（无 IO、无依赖）
 *
 * 同步协议核心：逐卡 LWW（Last-Write-Wins，`updatedAt` 新者胜）+ 删除墓碑。
 * 墓碑 = `deleted:true` 的卡片；同刻（updatedAt 相等）时删除方优先，防止已删卡片复活。
 * 该模块不感知数据来自本地文件夹 / WebDAV / GitHub —— transport 与合并完全解耦。
 */

/** 会被同步的卡片业务字段 */
export const CARD_FIELDS = Object.freeze([
  'content', 'type', 'done', 'assignedDate', 'time', 'startTime', 'endTime', 'priority', 'tags', 'meta',
]);

function normalizeMeta(input) {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  for (const k of ['createdBy', 'updatedBy']) {
    const v = input[k];
    if (v && typeof v === 'object') {
      const ev = {};
      for (const kk of ['origin', 'agent', 'model', 'project', 'device', 'at']) {
        if (v[kk] !== undefined && v[kk] !== null) ev[kk] = v[kk];
      }
      out[k] = ev;
    }
  }
  return Object.keys(out).length ? out : null;
}

function normalizeTags(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const t of input) {
    if (typeof t !== 'string') continue;
    const s = t.trim().toLowerCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

const TYPES = ['text', 'task', 'idea'];
const PRIORITIES = ['high', 'medium', 'low'];

/** 归一化卡片，便于比较（字段缺失按默认值补齐） */
export function normalizeCard(card = {}) {
  const start = str(card.startTime) ?? str(card.time) ?? null;
  return {
    id: card.id,
    content: typeof card.content === 'string' ? card.content : '',
    type: TYPES.includes(card.type) ? card.type : 'text',
    done: Boolean(card.done),
    assignedDate: str(card.assignedDate),
    time: str(card.time) ?? start,
    startTime: start,
    endTime: str(card.endTime),
    priority: PRIORITIES.includes(card.priority) ? card.priority : 'medium',
    tags: normalizeTags(card.tags),
    meta: normalizeMeta(card.meta),
    createdAt: str(card.createdAt),
    updatedAt: str(card.updatedAt),
    deleted: Boolean(card.deleted),
  };
}

function str(v) { return typeof v === 'string' ? v : (v == null ? null : String(v)); }

/**
 * 比较两张同 id 卡片，返回胜者。
 * 规则：updatedAt 新者胜；同刻删除方胜；完全同刻同态取 local（确定性）。
 */
export function pickWinner(local, remote) {
  if (!local) return remote;
  if (!remote) return local;
  const lu = local.updatedAt ?? '';
  const ru = remote.updatedAt ?? '';
  if (lu > ru) return local;
  if (ru > lu) return remote;
  if (local.deleted !== remote.deleted) return local.deleted ? local : remote;
  return local;
}

/**
 * 合并两组卡片集合。
 * @param {object[]} localCards
 * @param {object[]} remoteCards
 * @returns {{cards: object[], stats: object, conflicts: object[]}}
 */
export function mergeCardSets(localCards = [], remoteCards = []) {
  const localMap = new Map();
  for (const c of localCards) if (c?.id) localMap.set(c.id, normalizeCard(c));
  const remoteMap = new Map();
  for (const c of remoteCards) if (c?.id) remoteMap.set(c.id, normalizeCard(c));

  const ids = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const cards = [];
  const conflicts = [];
  const stats = { total: 0, added: 0, updated: 0, deleted: 0, kept: 0 };

  for (const id of ids) {
    const local = localMap.get(id) ?? null;
    const remote = remoteMap.get(id) ?? null;
    const winner = pickWinner(local, remote);
    if (!winner) continue;

    if (!local) {
      stats.added++;
    } else if (!remote) {
      stats.kept++;
    } else if ((local.updatedAt ?? '') !== (remote.updatedAt ?? '')) {
      const localWins = winner === local;
      if (localWins) stats.kept++; else stats.updated++;
      conflicts.push({
        id,
        localUpdatedAt: local.updatedAt,
        remoteUpdatedAt: remote.updatedAt,
        winner: localWins ? 'local' : 'remote',
        deleted: winner.deleted,
      });
    } else {
      stats.kept++;
    }

    if (winner.deleted) stats.deleted++;
    stats.total++;
    cards.push(winner);
  }

  // 稳定输出顺序，便于比对与快照 diff
  cards.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  conflicts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { cards, stats, conflicts };
}

/** 两张卡片业务字段是否相等（忽略 updatedAt/deleted 之外的元信息） */
export function cardsEqual(a, b) {
  if (!a || !b) return a === b;
  const na = normalizeCard(a);
  const nb = normalizeCard(b);
  if (na.deleted !== nb.deleted) return false;
  if (na.updatedAt !== nb.updatedAt || na.createdAt !== nb.createdAt) return false;
  return CARD_FIELDS.every(f => {
    const av = na[f];
    const bv = nb[f];
    if (Array.isArray(av) || Array.isArray(bv)) {
      return Array.isArray(av) && Array.isArray(bv) && av.length === bv.length && av.every((v, i) => v === bv[i]);
    }
    if (f === 'meta') {
      return JSON.stringify(av ?? null) === JSON.stringify(bv ?? null);
    }
    return av === bv;
  });
}
