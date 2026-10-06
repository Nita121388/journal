/**
 * card-schema.js — 卡片字段契约（纯逻辑叶子）
 *
 * 单一真相：卡片字段枚举、保留字、归一化原语。
 * 同时被 **UI 侧**（乐观构造卡片）与 **host 侧**（权威存储归一化）消费，
 * 杜绝两侧归一化逻辑各自演化造成的漂移。
 *
 * 约束（由 ESLint 边界规则强制）：无 DOM / 无 storage / 无 chrome / 无 node:。
 *
 * @typedef {'text'|'task'|'idea'} CardType
 * @typedef {'high'|'medium'|'low'} Priority
 * @typedef {'none'|'todo'|'doing'|'done'} Status
 */

/** 卡片类型全集 */
export const CARD_TYPES = Object.freeze(['text', 'task', 'idea']);

/** 优先级全集（默认 medium） */
export const PRIORITIES = Object.freeze(['high', 'medium', 'low']);

/** 状态全集（默认由 type+done 推导） */
export const STATUSES = Object.freeze(['none', 'todo', 'doing', 'done']);

/** 用户自定义属性保留字（内建字段 + 系统字段），杜绝 props 覆盖一级字段 */
export const RESERVED_PROPS = new Set([
  'id', 'content', 'type', 'done', 'assignedDate', 'time', 'startTime', 'endTime',
  'priority', 'tags', 'emoji', 'title', 'status', 'progress', 'duration', 'props',
  'project', 'meta', 'createdAt', 'updatedAt', 'deleted',
  'createdBy', 'updatedBy', 'provenance', 'deviceId', 'lastAgent',
]);

/**
 * 由 type+done 推导状态（历史数据读侧映射，不写库）
 * @param {string} type
 * @param {boolean} done
 * @returns {string}
 */
export function statusFromTypeDone(type, done) {
  if (type === 'task') return done ? 'done' : 'todo';
  return 'none';
}

/**
 * 归一化进度为 0–100 整数；`done` 且无进度时补 100。
 * @param {unknown} p
 * @param {string} status
 * @returns {number|null}
 */
export function normalizeProgress(p, status) {
  let v = null;
  if (p !== null && p !== undefined && p !== '') {
    const n = Number(p);
    if (Number.isFinite(n)) v = Math.max(0, Math.min(100, Math.round(n)));
  }
  if (v == null && status === 'done') v = 100;
  return v;
}

/**
 * 归一化时长（分钟）；非法/负数 → null。
 * @param {unknown} d
 * @returns {number|null}
 */
export function normalizeDuration(d) {
  if (d === null || d === undefined || d === '') return null;
  const n = Number(d);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/**
 * 归一化自定义属性：剔除保留字与非字符串 key。
 * @param {unknown} input
 * @returns {Record<string, unknown>}
 */
export function normalizeProps(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof k !== 'string' || !k || RESERVED_PROPS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * 归一化标签数组：trim + 小写 + 去重 + 过滤空串。
 * @param {unknown} input
 * @returns {string[]}
 */
export function normalizeTags(input) {
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
