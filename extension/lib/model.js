/**
 * model.js — 纯函数层，无 DOM，无 storage 读写，无外部依赖
 * 依赖图：model.js 导入 nothing（纯推导）
 */

/**
 * 生成当天日期 key，格式 "YYYY-MM-DD"
 * @returns {string}
 */
export function todayKey() {
  return toDayKey(new Date());
}

/**
 * 本地时区日期 key "YYYY-MM-DD"。
 * 用本地字段而非 toISOString()，避免 UTC+8 凌晨 0–8 点被算成前一天。
 * @param {Date} date
 * @returns {string}
 */
export function toDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * 获取当前时间 HH:MM
 * @returns {string}
 */
export function currentTime() {
  const now = new Date();
  return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
}

/* ─── 卡片操作 ───────────────────────────────────────────── */

/**
 * 创建一张新卡片
 * @param {object} patch — { content?, type?, done?, assignedDate?, time?, startTime?, endTime? }
 * @returns {import('./types').Card}
 */
export function createCard(patch = {}) {
  const now = new Date().toISOString();
  const start = patch.startTime ?? patch.time ?? null;
  return {
    id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    content: patch.content ?? '',
    type: patch.type ?? 'text',
    done: patch.done ?? false,
    assignedDate: patch.assignedDate ?? null,
    time: patch.time ?? start,
    startTime: start,
    endTime: patch.endTime ?? null,
    priority: ['high', 'medium', 'low'].includes(patch.priority) ? patch.priority : 'medium',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 迁移旧 journals 格式为卡片数组
 * @param {Record<string, string|{content:string, createdAt?:string, updatedAt?:string}>} oldJournals
 * @returns {Card[]}
 */
export function migrateOldJournals(oldJournals) {
  if (!oldJournals || typeof oldJournals !== 'object') return [];
  const cards = [];
  const now = new Date().toISOString();
  for (const [dayKey, entry] of Object.entries(oldJournals)) {
    if (typeof entry === 'string') {
      if (!entry) continue; // 空内容跳过
      cards.push({
        id: 'c_mj_' + dayKey,
        content: entry,
        type: 'text',
        done: false,
        assignedDate: dayKey,
        time: null,
        createdAt: new Date(dayKey + 'T09:00:00.000Z').toISOString(),
        updatedAt: now,
      });
    } else if (entry && typeof entry === 'object' && typeof entry.content === 'string') {
      if (!entry.content) continue;
      cards.push({
        id: 'c_mj_' + dayKey,
        content: entry.content,
        type: 'text',
        done: false,
        assignedDate: dayKey,
        time: null,
        createdAt: entry.createdAt ?? new Date(dayKey + 'T09:00:00.000Z').toISOString(),
        updatedAt: entry.updatedAt ?? now,
      });
    }
  }
  return cards;
}

/**
 * 迁移旧 todos 格式为卡片数组
 * @param {Array<{id:string, title:string, done:boolean, due:string|null, priority:string}>} oldTodos
 * @returns {Card[]}
 */
export function migrateOldTodos(oldTodos) {
  if (!Array.isArray(oldTodos)) return [];
  const now = new Date().toISOString();
  return oldTodos.filter(t => t && t.title).map(t => ({
    id: 'c_mt_' + t.id,
    content: t.title,
    type: 'task',
    done: t.done,
    assignedDate: t.due ?? null,
    time: null,
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * 获取某天的卡片（按 time 升序，null time 排最后）
 * @param {Card[]} cards
 * @param {string} date — YYYY-MM-DD
 * @returns {Card[]}
 */
export function getCardsByDate(cards, date) {
  if (!Array.isArray(cards)) return [];
  return cards
    .filter(c => c.assignedDate === date)
    .sort((a, b) => {
      const sa = getCardStartTime(a);
      const sb = getCardStartTime(b);
      if (sa && sb) return sa.localeCompare(sb) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
      if (sa) return -1;
      if (sb) return 1;
      return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
    });
}

/**
 * 获取卡片池（assignedDate === null）
 * @param {Card[]} cards
 * @returns {Card[]}
 */
export function getCardPool(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.filter(c => c.assignedDate === null);
}

/**
 * 按时间段分组（5 分钟窗口内并列）
 * @param {Card[]} dayCards — 某天已排序的卡片
 * @returns {Array<{time:string|null, cards:Card[]}>}
 */
export function groupCardsForTimeline(dayCards) {
  if (!dayCards.length) return [];
  const groups = [];
  for (const card of dayCards) {
    const cardTime = getCardStartTime(card);
    if (!cardTime) {
      // 无时间卡片归入 "全天" 组（置于最后）
      const last = groups[groups.length - 1];
      if (last && last.time === null) {
        last.cards.push(card);
      } else {
        groups.push({ time: null, cards: [card] });
      }
      continue;
    }
    const last = groups[groups.length - 1];
    if (last && last.time !== null) {
      // 检查是否在 5 分钟窗口内（并列）
      const diffMin = timeToMinutes(cardTime) - timeToMinutes(last.time);
      if (diffMin <= 5 && diffMin >= 0) {
        last.cards.push(card);
        continue;
      }
    }
    groups.push({ time: cardTime, cards: [card] });
  }
  return groups;
}

/* ─── 日程时间工具（15 分钟网格） ───────────────────────────── */

/** @param {string} hhmm — "HH:MM" @returns {number} 当天分钟数 */
export function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** @param {number} mins — 当天分钟数 @returns {string} "HH:MM" */
export function minutesToTime(mins) {
  const total = ((Math.round(mins) % 1440) + 1440) % 1440;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

/** @param {string} hhmm @param {number} mins @returns {string} */
export function addMinutes(hhmm, mins) {
  return minutesToTime(timeToMinutes(hhmm) + mins);
}

/** 四舍五入吸附到 15 分钟 */
export function snapToQuarter(hhmm) {
  return minutesToTime(Math.round(timeToMinutes(hhmm) / 15) * 15);
}

/** 向上取整吸附到 15 分钟 */
export function snapUpToQuarter(hhmm) {
  return minutesToTime(Math.ceil(timeToMinutes(hhmm) / 15) * 15);
}

/** 兼容读取开始时间：startTime ?? time */
export function getCardStartTime(card) {
  return card?.startTime ?? card?.time ?? null;
}

/** 兼容读取结束时间：endTime ?? start+15min */
export function getCardEndTime(card) {
  if (card?.endTime) return card.endTime;
  const start = getCardStartTime(card);
  return start ? addMinutes(start, 15) : null;
}

/** @returns {number} 持续分钟数（无时间返回 0） */
export function getCardDuration(card) {
  const s = getCardStartTime(card);
  const e = getCardEndTime(card);
  if (!s || !e) return 0;
  return Math.max(0, timeToMinutes(e) - timeToMinutes(s));
}

/**
 * 重叠区间 lane 分配（区间分区贪心算法）
 * @param {Array<{id:string, start:number, end:number}>} items — 分钟数区间
 * @returns {Map<string, {lane:number, laneCount:number}>}
 */
export function layoutScheduleLanes(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const out = new Map();
  let group = [];
  let groupEnd = -1;
  let groupMax = 0;
  let laneEnd = [];
  const flush = () => {
    for (const it of group) out.set(it.id, { lane: it.lane, laneCount: groupMax });
    group = [];
    groupEnd = -1;
    groupMax = 0;
    laneEnd = [];
  };
  for (const it of sorted) {
    if (group.length && it.start >= groupEnd) flush();
    let lane = laneEnd.findIndex(end => end <= it.start);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(it.end);
    } else {
      laneEnd[lane] = it.end;
    }
    it.lane = lane;
    group.push(it);
    groupEnd = Math.max(groupEnd, it.end);
    groupMax = Math.max(groupMax, laneEnd.length);
  }
  flush();
  return out;
}

/**
 * 按天统计卡片数量：dayKey → 数量
 * @param {Card[]} cards
 * @returns {Record<string, number>}
 */
export function countCardsByDay(cards) {
  if (!Array.isArray(cards)) return {};
  const out = {};
  for (const card of cards) {
    if (!card.assignedDate) continue;
    out[card.assignedDate] = (out[card.assignedDate] || 0) + 1;
  }
  return out;
}

/**
 * 获取某天的卡片类型分布
 * @param {Card[]} cards
 * @param {string} date
 * @returns {{text:number, task:number, idea:number}}
 */
export function getCardTypeCounts(cards, date) {
  const dayCards = getCardsByDate(cards, date);
  return {
    text: dayCards.filter(c => c.type === 'text').length,
    task: dayCards.filter(c => c.type === 'task').length,
    idea: dayCards.filter(c => c.type === 'idea').length,
  };
}

/**
 * 热力图聚合：dayKey → 卡片数（0-5+ 档位）
 * @param {Card[]} cards
 * @returns {Record<string, number>}
 */
export function aggregateHeatmap(cards) {
  if (!Array.isArray(cards)) return {};
  return countCardsByDay(cards);
}

/* ─── 兼容旧接口（保持向后兼容） ─────────────────────────────── */

/**
 * 根据 todos 数组生成待办统计摘要
 * @param {Array<{id:string, title:string, done:boolean, due:string|null, priority:string}>} todos
 * @returns {{total:number, done:number, pending:number}}
 */
export function todoSummary(todos) {
  if (!Array.isArray(todos)) return { total: 0, done: 0, pending: 0 };
  const done = todos.filter(t => t.done).length;
  return { total: todos.length, done, pending: todos.length - done };
}

/**
 * 生成某月的 6×7 日历矩阵（周日起始，跨月补齐）
 * @param {number} year — 四位年份
 * @param {number} month — 0-indexed 月份（0=一月，8=九月）
 * @returns {Array<Array<{dayKey:string, day:number, isCurrentMonth:boolean, isToday:boolean}>>}
 */
export function getMonthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const today = todayKey();
  const cells = [];
  const cursor = new Date(year, month, 1 - startOffset);
  for (let row = 0; row < 6; row++) {
    const week = [];
    for (let col = 0; col < 7; col++) {
      const dayKey = toDayKey(cursor);
      week.push({
        dayKey,
        day: cursor.getDate(),
        isCurrentMonth: cursor.getMonth() === month,
        isToday: dayKey === today,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    cells.push(week);
  }
  return cells;
}

/**
 * 生成 N 天的日期范围数组（含今日），用于热力图渲染
 * @param {number} days — 向前回溯天数，默认 365
 * @returns {string[]}
 */
export function dateRange(days = 365) {
  const keys = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(toDayKey(d));
  }
  return keys;
}
