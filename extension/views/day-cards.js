/**
 * day-cards.js — 「某天有哪些卡」的视图选择器（views 层）
 *
 * 从 rightview.js 抽出：month / week / timeline / rightview 四个模块都要用它，
 * 留在 rightview.js 会让 month.js ↔ rightview.js 形成循环 import。
 *
 * 只读 `vs.allCardsCache`（内存缓存），不发起任何 IO。
 */

import { getCardStartTime } from '../shared/model.js';
import { vs } from '../state/view-state.js';

/**
 * 同步取某天卡片（从缓存，按开始时间排序；无时间的排最后）。
 * @param {string} date dayKey YYYY-MM-DD
 * @returns {Array<object>}
 */
export function getCardsByDaySync(date) {
  if (!Array.isArray(vs.allCardsCache)) return [];
  return vs.allCardsCache
    .filter((c) => c.assignedDate === date)
    .sort((a, b) => {
      const sa = getCardStartTime(a);
      const sb = getCardStartTime(b);
      if (sa && sb) return sa.localeCompare(sb);
      if (sa) return -1;
      if (sb) return 1;
      return 0;
    });
}
