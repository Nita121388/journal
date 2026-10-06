/**
 * calendar.js — 月历网格视图（views 层）
 *
 * 读取 `vs` 的 calendarMonth/selectedDate/heatmapCache 渲染月度网格，
 * 并提供 header 日期文案与方向键导航绑定。
 */

import { getMonthMatrix } from '../shared/model.js';
import { formatDateLabel } from '../shared/format.js';
import { els } from '../components/dom-refs.js';
import { vs } from '../state/view-state.js';

/**
 * 渲染某月的日期按钮网格。
 * @param {HTMLElement} container
 * @param {Array<Array<object>>} matrix getMonthMatrix 结果
 * @param {string} activeDate 当前选中 dayKey
 * @param {Record<string, number>} heatmap dayKey → 卡片数
 */
export function renderCalendar(container, matrix, activeDate, heatmap) {
  container.replaceChildren();
  for (const week of matrix) {
    for (const cell of week) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-day';
      btn.dataset.day = cell.dayKey;

      const count = heatmap[cell.dayKey] ?? 0;

      // 日期数字
      const numSpan = document.createElement('span');
      numSpan.textContent = String(cell.day);
      btn.append(numSpan);

      // 卡片数指示器（只在有卡片时显示）
      if (count > 0) {
        const countEl = document.createElement('span');
        countEl.className = 'cal-count';
        countEl.textContent = count > 5 ? '5+' : `${count}`;
        btn.append(countEl);
      }

      btn.setAttribute('aria-label',
        `${cell.dayKey}${cell.isCurrentMonth ? '' : '（非本月）'}${cell.isToday ? '，今天' : ''}${count > 0 ? `，${count}张卡片` : ''}`
      );

      if (!cell.isCurrentMonth) btn.classList.add('is-out-month');
      if (cell.isToday) btn.classList.add('is-today');
      if (cell.dayKey === activeDate) btn.classList.add('is-selected');
      // 键盘可达：roving tabindex（仅选中/今天可 Tab，其余方向键导航）
      btn.tabIndex = (cell.isToday || cell.dayKey === activeDate) ? 0 : -1;
      // 卡片数量背景色
      const bgLevel = count >= 5 ? 5 : count;
      if (bgLevel > 0) btn.classList.add(`count-${bgLevel}`);

      container.append(btn);
    }
  }
}

/** 按 `vs.calendarMonth` 渲染月历并绑定键盘导航。 */
export function renderCalendarView() {
  const matrix = getMonthMatrix(vs.calendarMonth.year, vs.calendarMonth.month);
  if (els.calMonthLabel) {
    els.calMonthLabel.textContent = `${vs.calendarMonth.year}年${vs.calendarMonth.month + 1}月`;
  }
  renderCalendar(els.calendarGrid, matrix, vs.selectedDate, vs.heatmapCache);
  bindCalendarKeys();
}

/** 日历方向键导航（roving tabindex）—— 只绑定一次 */
let calKeysBound = false;
export function bindCalendarKeys() {
  const grid = els.calendarGrid;
  if (!grid || calKeysBound) return;
  calKeysBound = true;
  grid.addEventListener('keydown', (e) => {
    const cells = [...grid.querySelectorAll('.cal-day')];
    const i = cells.indexOf(document.activeElement);
    if (i < 0) return;
    const cols = 7;
    let n = -1;
    switch (e.key) {
      case 'ArrowRight': n = i + 1; break;
      case 'ArrowLeft': n = i - 1; break;
      case 'ArrowDown': n = i + cols; break;
      case 'ArrowUp': n = i - cols; break;
      case 'Home': n = 0; break;
      case 'End': n = cells.length - 1; break;
      default: return;
    }
    if (n < 0 || n >= cells.length) return;
    e.preventDefault();
    for (const c of cells) c.tabIndex = -1;
    cells[n].tabIndex = 0;
    cells[n].focus();
  });
}

/** header 顶栏日期文案。 */
export function updateHeaderDate() {
  if (els.todayDisplay) {
    els.todayDisplay.textContent = formatDateLabel(vs.selectedDate);
  }
}
