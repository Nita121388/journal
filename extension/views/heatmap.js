/**
 * heatmap.js — 日志热力图视图（views 层）
 *
 * 纯渲染：输入容器与 dayKey→数量 映射；不读数据源。
 */

import { todayKey, toDayKey, dateRange } from '../shared/model.js';
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
    const todayLogged = (heatmap[todayKey()] ?? 0) > 0;
    const cursor = new Date();
    // 今天还没记录时不直接归零（GitHub 式宽限）：从昨天起算，
    // 否则坚持了 30 天的人早上打开会看到 0 天（纯负反馈）。
    if (!todayLogged) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    // 用本地日期构造 dayKey：`toISOString()` 在 UTC+8 的 00:00–08:00 会算成前一天
    while ((heatmap[toDayKey(cursor)] ?? 0) > 0) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    // 不再显示空胶囊：无连续时也给出明确文案
    els.heatmapStreak.textContent = streak > 0
      ? `🔥 ${streak} 天${todayLogged ? '' : ' · 今天还没打卡'}`
      : '今天还没打卡';
  }

  // 默认滚到最右侧（今天在最右）
  container.scrollLeft = container.scrollWidth;
}
