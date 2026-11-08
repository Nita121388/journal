/**
 * month.js — 月历网格视图（views 层）
 *
 * 从 rightview.js 抽出，避免主调度文件持续膨胀（spec: views 每个 <400 行）。
 * 视觉向 Obsidian「达达清单」对齐：日期头（大号数字 + 节日副标 + 今天标）
 * + 格内彩色事件 pill（最多 3 条 + `+N`）。
 *
 * 渲染一律走 views/calendar-card.js 的公共组件，保证月/周/日同源。
 */

import { getMonthMatrix } from '../shared/model.js';
import { actions } from '../state/actions.js';
import { monthOf, vs } from '../state/view-state.js';
import { renderDayCardList, renderDayHeader } from './calendar-card.js';
import { toggleCardDetail } from './card-expand.js';
import { getCardsByDaySync } from './day-cards.js';

/**
 * 渲染月历网格到容器。
 * @param {HTMLElement} container 主视图容器（会被清空后填充）
 */
export function renderMonthGrid(container) {
  const matrix = getMonthMatrix(vs.calendarMonth.year, vs.calendarMonth.month);

  const weekday = document.createElement('div');
  weekday.className = 'cc-weekdays';
  for (const name of ['日', '一', '二', '三', '四', '五', '六']) {
    const s = document.createElement('span');
    s.textContent = name;
    weekday.append(s);
  }

  const grid = document.createElement('div');
  grid.className = 'cc-month-grid';

  for (const week of matrix) {
    for (const cell of week) {
      const cards = getCardsByDaySync(cell.dayKey);
      const dayEl = document.createElement('div');
      dayEl.className = 'cc-day';
      dayEl.dataset.day = cell.dayKey;
      if (!cell.isCurrentMonth) dayEl.classList.add('is-out-month');
      if (cell.isToday) dayEl.classList.add('is-today');
      if (cell.dayKey === vs.selectedDate) dayEl.classList.add('is-selected');

      dayEl.append(renderDayHeader(cell.dayKey, {
        isToday: cell.isToday,
        isSelected: cell.dayKey === vs.selectedDate,
        compact: true,
      }));

      dayEl.append(renderDayCardList(cards, {
        // 单击 = 展开详情（Milkdown 正文）；再点一次收起
        // 单击 = 展开详情（Milkdown 正文）；再点一次收起。编辑走详情里的「编辑」按钮
        onOpen: (card) => toggleCardDetail(card.id),
      }));

      // 点空白格 → 跳到该日的时间线（保持原有交互）
      dayEl.addEventListener('click', async (e) => {
        if (e.target.closest('.cc-pill, .cc-daylist-more')) return;
        vs.selectedDate = cell.dayKey;
        vs.weekAnchor = cell.dayKey;
        vs.calendarMonth = monthOf(cell.dayKey);
        vs.viewMode = 'timeline';
        await actions.refreshAll();
      });

      grid.append(dayEl);
    }
  }

  container.append(weekday, grid);
}
