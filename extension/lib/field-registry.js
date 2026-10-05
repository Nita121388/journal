/**
 * field-registry.js — 统一字段注册表（Field Registry）
 *
 * 概念：所有字段——内建必选、内建可选、属性库自定义——统一为同一条 FieldDef。
 * 内建/用户只是 `source` 属性，不再是两套数据结构。
 *
 * 三个正交维度，各管一件事：
 *   type     值形态：值怎么存、编辑器用什么控件
 *   behavior 特色功能：引擎拿到值后做什么（渲染/联动/归一化）
 *   storage  值在卡片上的落位（卡片一级字段 or card.props）
 *
 * 纯函数模块，无 DOM / storage 依赖，可单测。持久化仍由 sidepanel 的
 * propLibrary（host meta `propertyLibrary`）负责；本模块通过 getter 实时读取，
 * 因此属性库变更后无需重新 init。
 */

// ── 内建种子（唯一真相：内建字段的 type/behavior/storage）──────────────────
// storage.fields: templateKey -> card 的一级字段名；empty: 建卡空值兜底
const BUILTIN_SEEDS = [
  // 必选（每卡必有 → UI 锁定行、模板必含）
  { key: 'title',   icon: '🏷️', label: '标题',           type: 'text',     behavior: 'none',    required: true, storage: { kind: 'card', fields: { value: 'title' }, empty: '' } },
  { key: 'content', icon: '📄', label: '内容',           type: 'textarea', behavior: 'none',    required: true, storage: { kind: 'card', fields: { value: 'content' }, empty: '' } },
  { key: 'tags',    icon: '#️⃣', label: '标签',          type: 'tags',     behavior: 'tags',    required: true, storage: { kind: 'card', fields: { value: 'tags' }, empty: [] } },
  // 内建可选（用户可在模板里选用；不是必填）。顺序 = 卡片池徽标渲染顺序（状态/优先级/进度/日期/排程/项目）
  { key: 'status',       icon: '📌', label: '状态',           type: 'select',   behavior: 'status',   required: false, options: ['none', 'todo', 'doing', 'done'], storage: { kind: 'card', fields: { value: 'status' }, empty: 'none' } },
  { key: 'priority',     icon: '⭐️', label: '优先级',        type: 'select',   behavior: 'priority', required: false, options: ['high', 'medium', 'low'], storage: { kind: 'card', fields: { value: 'priority' }, empty: 'medium' } },
  { key: 'progress',     icon: '📊', label: '进度',          type: 'number',   behavior: 'progress', required: false, storage: { kind: 'card', fields: { value: 'progress' }, empty: null } },
  { key: 'assignedDate', icon: '🗓️', label: '日期',          type: 'date',     behavior: 'date',     required: false, storage: { kind: 'card', fields: { value: 'assignedDate' }, empty: null } },
  { key: 'project',      icon: '📁', label: '项目',          type: 'text',     behavior: 'project',  required: false, storage: { kind: 'card', fields: { value: 'project' }, empty: null } },
  { key: 'schedule',     icon: '⏱️', label: '起止时间/时长', type: 'schedule', behavior: 'schedule', required: false, storage: { kind: 'card', fields: { start: 'startTime', end: 'endTime', duration: 'duration' }, empty: null } },
].map((d) => ({ ...d, source: 'builtin', locked: true }));

const BUILTIN_BY_KEY = new Map(BUILTIN_SEEDS.map((d) => [d.key, d]));

/** 内建字段 key 集合（保留命名空间的一部分） */
export const BUILTIN_KEYS = new Set(BUILTIN_SEEDS.map((d) => d.key));

/** 默认空值（与 prop-infer.defaultValueForType 对齐的兜底） */
function defaultEmpty(type) {
  if (type === 'checkbox') return false;
  if (type === 'tags') return [];
  if (type === 'schedule') return null;
  return '';
}

// ── 用户字段来源（由 sidepanel 注入 getter，实时读取 propLibrary）─────────
let userFieldsProvider = () => ({});

/**
 * 初始化注册表。
 * @param {{ getUserFields: () => Record<string, object> }} opts getUserFields 返回属性库对象
 */
export function initFieldRegistry({ getUserFields } = {}) {
  if (typeof getUserFields === 'function') userFieldsProvider = getUserFields;
}

/** 把属性库里的原始定义归一化为 FieldDef（补齐 behavior/storage 等派生字段） */
function normalizeUserDef(raw, key) {
  const type = raw?.type || 'text';
  return {
    key,
    label: raw?.label || key,
    icon: raw?.icon || '•',
    type,
    behavior: raw?.behavior || 'none',
    required: false,
    source: 'user',
    locked: false,
    ...(raw?.options ? { options: raw.options } : {}),
    storage: raw?.storage || { kind: 'props' },
    empty: raw?.empty ?? defaultEmpty(type),
  };
}

/**
 * 取字段定义（内建优先；用户字段归一化）。替代旧的 findPropDef 分叉。
 * @param {string} key
 * @returns {object|null} FieldDef
 */
export function getFieldDef(key) {
  if (!key) return null;
  const b = BUILTIN_BY_KEY.get(key);
  if (b) return b;
  const raw = userFieldsProvider()?.[key];
  return raw ? normalizeUserDef(raw, key) : null;
}

/**
 * 列出字段定义。
 * @param {{ source?: 'builtin'|'user', behavior?: string, required?: boolean }} [filter]
 * @returns {object[]} FieldDef[]
 */
export function listFieldDefs(filter = {}) {
  const { source, behavior, required } = filter;
  const out = [];
  for (const d of BUILTIN_SEEDS) {
    if (source && d.source !== source) continue;
    if (behavior && d.behavior !== behavior) continue;
    if (required !== undefined && d.required !== required) continue;
    out.push(d);
  }
  const user = userFieldsProvider() || {};
  for (const [key, raw] of Object.entries(user)) {
    const d = normalizeUserDef(raw, key);
    if (source && d.source !== source) continue;
    if (behavior && d.behavior !== behavior) continue;
    if (required !== undefined && d.required !== required) continue;
    out.push(d);
  }
  return out;
}

/**
 * 是否保留命名空间（内建 key 或 RESERVED_PROPS）。用户不可用作属性名。
 * @param {string} key
 * @param {Set<string>} [reservedProps] RESERVED_PROPS 集合（由调用方注入，避免循环依赖）
 */
export function isReservedKey(key, reservedProps) {
  if (!key) return true;
  if (BUILTIN_KEYS.has(key)) return true;
  return reservedProps ? reservedProps.has(key) : false;
}

/** 取字段 behavior（默认 'none'） */
export function getBehavior(key) {
  return getFieldDef(key)?.behavior || 'none';
}

/** 取字段 storage（默认进 card.props） */
export function getStorage(key) {
  return getFieldDef(key)?.storage || { kind: 'props' };
}

/**
 * 按 storage 把值写入卡片对象（createFromTemplate 用）。行为等价于旧 switch(f.key)：
 *   - card 一级字段：无条件写（value ?? empty）
 *   - props：仅当值非 undefined/null/'' 时写入（与旧 default 分支一致）
 * @param {object} card 可写的卡片对象（patch 或真实 card）
 * @param {string} key
 * @param {*} value
 * @returns {boolean} 是否写入
 */
export function writeValueToCard(card, key, value) {
  if (!key) return false;
  const def = getFieldDef(key);
  // 未登记的 key（旧模板里属性库已被删除的字段）：退化为 props，保持旧 default 分支行为
  const st = def?.storage || { kind: 'props' };
  // empty 可能是显式 null（progress/assignedDate 等），必须用 hasOwnProperty 判断而非 ??（否则 null 被当作缺失）
  const empty = Object.prototype.hasOwnProperty.call(st, 'empty') ? st.empty : defaultEmpty(def?.type);

  if (st.kind === 'props') {
    if (value === undefined || value === null || value === '') return false;
    card.props = card.props || {};
    card.props[key] = value;
    return true;
  }

  // card 一级字段
  const fields = st.fields || {};
  if (fields.value !== undefined) {
    let v = value ?? empty;
    if (def.type === 'tags') v = Array.isArray(value) ? value : (value ?? empty);
    card[fields.value] = v;
    return true;
  }
  // 多字段映射（schedule: {start,end,duration}）
  if (value && typeof value === 'object') {
    for (const [tplKey, cardField] of Object.entries(fields)) {
      const v = value[tplKey];
      card[cardField] = tplKey === 'duration' ? (v ?? null) : (v || null);
    }
    return true;
  }
  return false;
}

/**
 * 按 storage 从卡片对象读回值。
 * @param {object} card
 * @param {string} key
 */
export function readValueFromCard(card, key) {
  const def = getFieldDef(key);
  if (!def) return undefined;
  const st = def.storage || { kind: 'props' };
  if (st.kind === 'props') return card?.props?.[key];
  const fields = st.fields || {};
  if (fields.value !== undefined) return card?.[fields.value];
  const out = {};
  for (const [tplKey, cardField] of Object.entries(fields)) out[tplKey] = card?.[cardField];
  return out;
}