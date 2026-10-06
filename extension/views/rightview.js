/**
 * rightview.js — 右侧主视图调度 + 月历/周历（views 层）
 *
 * renderRightView 按 vs.viewMode 分派到 renderMonthGrid / renderWeekGrid / renderTimeline；
 * 周视图复用 timeline 的卡片渲染与刻度，并支持拖拽/框选建卡。
 */

import { els } from '../components/dom-refs.js';
import { compactDateLabel, typeIcon } from '../shared/format.js';
import { currentTime, getCardStartTime, getCardTypeCounts, getMonthMatrix, timeToMinutes, toDayKey, todayKey } from '../shared/model.js';
import { actions } from '../state/actions.js';
import { monthOf, vs } from '../state/view-state.js';
import { renderTimeline, scheduleHeight } from './timeline.js';
import { CARD_TYPES } from '../shared/card-schema.js';

import { renderWeekGrid } from './week.js';
export function addDays(dayKey, n) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toDayKey(dt);
}

/** 右侧头部标题文案 */
function viewHeaderLabel() {
  if (vs.viewMode === 'month') {
    const { year, month } = vs.calendarMonth;
    return `${year}年${month + 1}月`;
  }
  if (vs.viewMode === 'week') {
    const [y, m, d] = vs.weekAnchor.split('-').map(Number);
    const sun = new Date(y, m - 1, d); sun.setDate(sun.getDate() - sun.getDay());
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    // 窄侧栏下用短式（月/日），避免被右侧工具组挤没
    return `${toDayKey(sun).slice(5).replace('-', '/')} – ${toDayKey(sat).slice(5).replace('-', '/')}`;
  }
  const date = vs.selectedDate;
  const typeCounts = getCardTypeCounts(vs.allCardsCache, date);
  const parts = [];
  if (typeCounts.text) parts.push(`${typeCounts.text}📝`);
  if (typeCounts.task) parts.push(`${typeCounts.task}☑️`);
  const countStr = parts.length ? ` · ${parts.join(' ')}` : '';
  return `📅 ${compactDateLabel(date)}${countStr}`;
}

/** 同步取某天卡片（从缓存，按时间排序） */
export function getCardsByDaySync(date) {
  if (!Array.isArray(vs.allCardsCache)) return [];
  return vs.allCardsCache
    .filter(c => c.assignedDate === date)
    .sort((a, b) => {
      const sa = getCardStartTime(a), sb = getCardStartTime(b);
      if (sa && sb) return sa.localeCompare(sb);
      if (sa) return -1;
      if (sb) return 1;
      return 0;
    });
}

/** 高亮当前视图模式按钮 */
export function markViewMode() {
  els.viewModeBtns?.forEach(b => b.classList.toggle('is-active', b.dataset.mode === vs.viewMode));
}

/** 右侧视图统一入口 */
/**
 * 一次性聚焦滚动：打开面板 / 切换日期 / 切换视图后，让「当前时刻」垂直居中。
 * 不足以居中时钳制到边界（顶部 0 / 底部 maxScroll），不强拽；非今天则聚焦
 * 当天最早一张定时卡（无卡则不滚）。消费后不再干预用户滚动与每分钟 marker 刷新。
 */
// pendingFocusScroll 已并入 state/view-state.js 的 vs.pendingFocusScroll
export function requestFocusScroll() { vs.pendingFocusScroll = true; }

function scrollTimelineToFocus(container, prevScroll = 0) {
  if (!container) return;
  if (vs.viewMode === 'month') return; // 月视图无时间轴，也不恢复（整月网格）

  if (vs.pendingFocusScroll) {
    vs.pendingFocusScroll = false;
    let targetY = null;
    if (vs.selectedDate === todayKey()) {
      const now = new Date();
      const nowMin = Math.max(vs.viewStartMin, Math.min(vs.viewEndMin, now.getHours() * 60 + now.getMinutes()));
      targetY = scheduleHeight(nowMin);
    } else {
      // 非今天：聚焦当天最早一张定时卡
      const cards = getCardsByDaySync(vs.selectedDate).filter((c) => getCardStartTime(c));
      if (cards.length) {
        const s = timeToMinutes(getCardStartTime(cards[0]));
        targetY = scheduleHeight(Math.max(vs.viewStartMin, s));
      }
    }
    if (targetY === null) { container.scrollTop = 0; return; }
    const clientH = container.clientHeight;
    const maxScroll = Math.max(0, container.scrollHeight - clientH);
    if (maxScroll === 0) return; // 内容不足一屏，不滚
    // 钳制到边界：贴顶/贴底时停在自然位置，不强行居中
    container.scrollTop = Math.max(0, Math.min(maxScroll, targetY - clientH / 2));
    return;
  }

  // 常规重渲染（host 同步/数据变化）：恢复此前滚动位置，避免 replaceChildren 重置回顶部
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTop = Math.min(Math.max(0, prevScroll), maxScroll);
}

export async function renderRightView() {
  markViewMode();
  if (els.timelineDateHeader) els.timelineDateHeader.textContent = viewHeaderLabel();
  const container = els.timelineContainer;
  const prevScroll = container.scrollTop; // 渲染前捕获，供恢复（replaceChildren 会重置滚动）
  container.replaceChildren();
  container.classList.toggle('calview-week-wrap', vs.viewMode === 'week');
  if (vs.viewMode === 'month') { renderMonthGrid(container); return; }
  if (vs.viewMode === 'week') { renderWeekGrid(container); scrollTimelineToFocus(container, prevScroll); return; }
  await renderTimeline();
  scrollTimelineToFocus(container, prevScroll);
}

/** 月历网格 */
function renderMonthGrid(container) {
  const matrix = getMonthMatrix(vs.calendarMonth.year, vs.calendarMonth.month);
  const weekday = document.createElement('div');
  weekday.className = 'calview-weekdays';
  for (const name of ['日', '一', '二', '三', '四', '五', '六']) {
    const s = document.createElement('span');
    s.textContent = name;
    weekday.append(s);
  }
  const grid = document.createElement('div');
  grid.className = 'calview-month-grid';
  for (const week of matrix) {
    for (const cell of week) {
      const dayEl = document.createElement('div');
      dayEl.className = 'calview-day';
      dayEl.dataset.day = cell.dayKey;
      if (!cell.isCurrentMonth) dayEl.classList.add('is-out-month');
      if (cell.isToday) dayEl.classList.add('is-today');
      if (cell.dayKey === vs.selectedDate) dayEl.classList.add('is-selected');
      const num = document.createElement('div');
      num.className = 'calview-day-num';
      num.textContent = String(cell.day);
      dayEl.append(num);
      const cards = getCardsByDaySync(cell.dayKey);
      const list = document.createElement('div');
      list.className = 'calview-day-cards';
      for (const card of cards.slice(0, 3)) list.append(buildCalSummary(card));
      if (cards.length > 3) {
        const more = document.createElement('div');
        more.className = 'calview-more';
        more.textContent = `+${cards.length - 3}`;
        list.append(more);
      }
      dayEl.append(list);
      dayEl.addEventListener('click', async (e) => {
        if (e.target.closest('.calview-summary')) return;
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

/** 周历 7 列 */
/**
 * 绑定「拖动框选创建时间范围」交互（周视图列 body）。
 * mousedown 起点 → mousemove 实时选区 → mouseup 松手以选中起止时间创建。
 * 纯点击（拖动 < 3px）不触发，由调用方的 click 处理单格创建。
 * @param {HTMLElement} el 容器
 * @param {(startMin:number, endMin:number)=>void} onRange 框选完成回调（分钟）
 */
// 已提取到 views/week.js（见顶部 import）。

/** 卡片摘要（月历/周历共用）：时间 + 类型图标 + 内容截断，点击进编辑器 */
function buildCalSummary(card) {
  const type = CARD_TYPES.includes(card.type) ? card.type : 'text';
  const el = document.createElement('div');
  el.className = `calview-summary type-${type}` + (type === 'task' && card.done ? ' is-done' : '');
  const start = getCardStartTime(card);
  el.append(...[
    start ? spanEl('calview-summary-time', start) : null,
    spanEl('card-type-icon', typeIcon(type, card.emoji)),
    spanEl('calview-summary-text', card.content || '(空卡片)'),
  ].filter(Boolean));
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    actions.openEditor(card, start ?? currentTime(), card.assignedDate ?? vs.selectedDate);
  });
  return el;
}

/** 建一个带 class 与文本的 `<span>`（文本走 textContent，天然安全）。 */
function spanEl(className, text) {
  const s = document.createElement('span');
  s.className = className;
  s.textContent = text;
  return s;
}
