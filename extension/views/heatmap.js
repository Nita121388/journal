/**
 * heatmap.js — 日志热力图视图（views 层）
 *
 * 纯渲染：输入容器与 dayKey→数量 映射；不读数据源。
 */

import { todayKey, dateRange } from '../shared/model.js';
import { els } from '../components/dom-refs.js';

/**
 * 渲染 365 天热力图 + 连续打卡徽标。
 * @param {HTMLElement} container
 * @param {Record<string, number>} heatmap dayKey → 卡片数
 */
export function renderHeatmap(container, heatmap) {
  container.replaceChildren();
  const today = todayKey();
  for (const day of dateRange(365)) {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.dataset.day = day;
    const count = heatmap[day] ?? 0;
    // 6 档着色
    const level = count >= 5 ? 5 : count;
    if (level > 0) cell.classList.add(`level-${level}`);
    if (day === today) cell.classList.add('is-today');
    cell.title = count > 0 ? `${day} · ${count} 张卡片` : `${day}（无记录）`;
    container.append(cell);
  }

  // 更新连续打卡数
  if (els.heatmapStreak) {
    let streak = 0;
    const d = new Date();
    while (true) {
      const dk = d.toISOString().slice(0, 10);
      if ((heatmap[dk] ?? 0) > 0) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    els.heatmapStreak.textContent = streak > 0 ? `🔥 ${streak} 天` : '';
  }

  // 默认滚到最右侧（今天在最右）
  container.scrollLeft = container.scrollWidth;
}
