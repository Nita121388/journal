/**
 * view-state.js — 视图可变状态（state 层）
 *
 * 拆分前这些是 entries/sidepanel.js 里的模块级 `let`，被 8+ 个渲染函数隐式共享。
 * 现集中到单一对象 `vs`，字段显式、来源唯一，便于阅读与后续按需拆分。
 *
 * 约定：
 *   - 只放「视图层 UI 状态」，不放数据（数据在 state/repository.js）。
 *   - 需要持久化的小偏好经平台端口的同步偏好接口（prefGet/prefSet）。
 *   - 渲染仍由调用方显式触发（不引入响应式 store）。
 */

import { todayKey } from '../shared/model.js';
import { getPort } from '../platform/index.js';

/**
 * 由 YYYY-MM-DD 求 { year, month }（month 为 0 基）。
 * @param {string} dayKey
 * @returns {{year:number, month:number}}
 */
export function monthOf(dayKey) {
  const [y, m] = dayKey.split('-').map(Number);
  return { year: y, month: m - 1 };
}

const today = todayKey();

export const vs = {
  // ── 日期与视图 ──
  /** @type {string} 当前选中日期 YYYY-MM-DD */
  selectedDate: today,
  /** @type {{year:number, month:number}} 日历当前月份 */
  calendarMonth: monthOf(today),
  /** @type {'month'|'week'|'timeline'} 右侧主视图模式 */
  viewMode: getPort().prefGet('journal.viewMode') || 'timeline',
  /** @type {string} 周历基准日期（该周某一天） */
  weekAnchor: today,
  /** @type {'default'|'full'} 时间线展示范围：默认 08-22，full=24 小时 */
  timelineSpan: getPort().prefGet('journal.timelineSpan') || 'default',

  // ── 数据派生缓存（渲染用） ──
  /** @type {Record<string, number>} dayKey → 卡片数 */
  heatmapCache: {},
  /** @type {object[]} 全部卡片（来自 repository 的快照） */
  allCardsCache: [],
  /** @type {number} 视图切换序号（防抖过期异步渲染） */
  switchSeq: 0,

  // ── 卡片池筛选 ──
  /** @type {''|'active'|'todo'|'doing'|'done'|'none'} */
  poolStatusFilter: '',
  /** @type {string} */
  poolTagFilter: '',
  /** @type {string} */
  poolProjectFilter: '',
  /** @type {'card'|'list'} */
  poolLayout: getPort().prefGet('journal.poolLayout') || 'card',

  // ── 命名视图 ──
  /** @type {object[]} */
  savedViews: [],
  /** @type {string} 当前命名视图 id（'' = 未命名/手动） */
  activeViewId: '',

  // ── 时间线滚动 ──
  /** @type {boolean} 下次渲染是否滚动到当前时刻 */
  pendingFocusScroll: false,
};
