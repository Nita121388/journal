/**
 * editor-fields.js — 编辑器属性集解析与渲染（features 层）
 *
 * 产品原则（2026-11-09 用户拍板）：**默认只给少量必要属性，其余由用户自建模板按需引入。**
 * 编辑器的属性行不再固定 9 组全上，而是「默认最小集 ∪ 当前模板声明的字段」。
 *
 * 边界（重要）：
 *   - 本模块只决定「哪些属性行可见、按什么顺序」；
 *   - **不**碰输入元素、id、读写逻辑与字段落位（`shared/field-registry.js` 的 storage）；
 *   - 因此数据形态零变化，`saveEditor()` / `formSnapshot()` 无需改动。
 *
 * 为什么用可见性而不是重建 DOM：`components/dom-refs.js` 在模块加载时按 id 抓到全部输入元素，
 * 重建节点会让那些引用变成孤儿（null / 脱离文档），风险远大于收益。
 */

import { getFieldDef, readValueFromCard } from '../shared/field-registry.js';

/**
 * 恒显示的属性行（产品默认必要项）。
 * `status` 是卡片池筛选与视图渲染的一等字段；`tags` 在注册表里是 `required`
 * （搜索框占位与卡片池筛选都依赖它），故两者不进模板也可用。
 */
export const BASE_FIELDS = ['status', 'tags'];

/** 可选属性行的固定顺序（= 属性区的视觉顺序，模板不能打乱） */
export const FIELD_ORDER = ['status', 'priority', 'progress', 'assignedDate', 'schedule', 'tags', 'project'];

/**
 * 把「模板字段 key 列表」解析成「要显示的属性行 key 列表」。
 *
 * 规则：
 *   - 默认集恒在（BASE_FIELDS）；
 *   - 模板里出现的内建可选字段并入；
 *   - 属性库已删除的字段（`getFieldDef` 返回 null）忽略；
 *   - 自定义属性（props）不在属性区渲染，走弹窗底部「自定义属性」区；
 *   - 输出顺序恒为 FIELD_ORDER，不受模板声明顺序影响。
 *
 * @param {string[]} [templateKeys] 模板声明的字段 key
 * @returns {string[]} 可见属性行 key（按 FIELD_ORDER 排序）
 */
export function resolveFields(templateKeys = []) {
  const wanted = new Set(BASE_FIELDS);
  for (const key of templateKeys ?? []) {
    if (!key || wanted.has(key)) continue;
    if (!FIELD_ORDER.includes(key)) continue;
    if (!getFieldDef(key)) continue;
    wanted.add(key);
  }
  return FIELD_ORDER.filter(k => wanted.has(k));
}

/** 字段的「未填」默认值：与这些值相等的属性不应因此被拉出来显示 */
const DEFAULT_EMPTY = { status: 'none', priority: 'medium', progress: 0 };

/**
 * 从卡片已填值反推应该显示的属性行。
 *
 * 理由：编辑已有卡片时若只按默认集收敛，用户之前填过的优先级/项目会被“藏起来”而无法修改。
 * 因此已有卡片 = 默认集 ∪ 卡片上真正有值的字段。
 *
 * @param {object|null} card
 * @returns {string[]} 有值的属性行 key（按 FIELD_ORDER）
 */
export function fieldsWithValues(card) {
  if (!card) return [];
  const out = [];
  for (const key of FIELD_ORDER) {
    if (key === 'schedule') {
      if (card.startTime || card.endTime || card.duration) out.push(key);
      continue;
    }
    const value = readValueFromCard(card, key);
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (Object.hasOwn(DEFAULT_EMPTY, key) && value === DEFAULT_EMPTY[key]) continue;
    out.push(key);
  }
  return out;
}

/**
 * 把可见性 + 顺序应用到属性区容器。
 *
 * 隐藏用 `hidden` 属性（禁止内联 style）；顺序用 `append` 移动既有节点
 * （`.prop-row` 是 `display: contents`，在 grid 里按 DOM 序落位）。
 *
 * @param {HTMLElement|null} container 属性区容器（`#card-editor-props`）
 * @param {string[]} keys 要显示的属性行 key（通常来自 resolveFields）
 */
export function applyFields(container, keys) {
  if (!container) return;
  const visible = new Set(keys ?? []);
  const rows = [...container.querySelectorAll('.prop-row[data-field]')];
  const byField = new Map(rows.map(row => [row.dataset.field, row]));
  for (const row of rows) row.hidden = !visible.has(row.dataset.field);
  // 重排：按 FIELD_ORDER 依次 append，未知行（未来新增）保持尾随
  for (const key of FIELD_ORDER) {
    const row = byField.get(key);
    if (row) container.append(row);
  }
  container.dataset.fields = (keys ?? []).join(',');
}
