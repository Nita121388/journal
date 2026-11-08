/**
 * rightview.js — 右侧主视图调度 + 月历/周历（views 层）
 *
 * renderRightView 按 vs.viewMode 分派到 renderMonthGrid / renderWeekGrid / renderTimeline；
 * 周视图复用 timeline 的卡片渲染与刻度，并支持拖拽/框选建卡。
 */

import { els } from '../components/dom-refs.js';
import { compactDateLabel } from '../shared/format.js';
import { getCardStartTime, getCardTypeCounts, timeToMinutes, toDayKey, todayKey } from '../shared/model.js';
import { vs } from '../state/view-state.js';
import { renderTimeline, scheduleHeight } from './timeline.js';
import { getCardsByDaySync } from './day-cards.js';
import { renderMonthGrid } from './month.js';
import { renderWeekGrid } from './week.js';
import { releaseAll as releaseMilkdown } from './milkdown-mount.js';
import { renderExpandedCard } from './card-expand.js';

export { getCardsByDaySync };
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
  // 人话而不是 emoji 密码：`2📝 3☑️` 人与读屏都读不出「几条未完成、几条记录」
  const parts = [];
  if (typeCounts.task) parts.push(`${typeCounts.task} 任务`);
  if (typeCounts.text) parts.push(`${typeCounts.text} 记录`);
  const countStr = parts.length ? ` · ${parts.join(' · ')}` : ' · 暂无记录';
  return `📅 ${compactDateLabel(date)}${countStr}`;
}

/**
 * 高亮当前视图模式按钮（顶部按钮组 + 底部 dock 同步）。
 *
 * 视觉高亮之外必须有可访问状态：读屏用户否则完全不知道当前是哪个视图。
 */
export function markViewMode() {
  for (const list of [els.viewModeBtns, els.viewDockBtns]) {
    list?.forEach((b) => {
      const on = b.dataset.mode === vs.viewMode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
}

/**
 * 请求一次「聚焦滚动」：打开面板 / 切换日期 / 切换视图后，让当前时刻垂直居中。
 * 不足以居中时钳制到边界，不强拽；非今天则聚焦当天最早一张定时卡；
 * **当天无卡片时回到顶部**（否则空态引导会被滚出视口）。
 * 消费一次后即失效，不再干预用户滚动与每分钟的 marker 刷新。
 */
export function requestFocusScroll() { vs.pendingFocusScroll = true; }

function scrollTimelineToFocus(container, prevScroll = 0) {
  if (!container) return;
  if (vs.viewMode === 'month') return; // 月视图无时间轴，也不恢复（整月网格）

  if (vs.pendingFocusScroll) {
    vs.pendingFocusScroll = false;
    let targetY = null;
    if (vs.selectedDate === todayKey()) {
      // 今天无卡片时**不要**聚焦当前时刻：那会把空态引导（top:96px）滚出视口，
      // “记录今天”的首屏引导等于不存在。改为回到顶部，让引导可见。
      if (!getCardsByDaySync(vs.selectedDate).length) { container.scrollTop = 0; return; }
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
  // 重渲染会把承载 Milkdown 的 DOM 一起扔掉；必须先显式销毁实例，否则 ProseMirror 泄漏
  releaseMilkdown();
  container.replaceChildren();
  container.classList.toggle('calview-week-wrap', vs.viewMode === 'week');
  if (vs.viewMode === 'month') {
    renderMonthGrid(container);
    renderExpandedCard(container);
    return;
  }
  if (vs.viewMode === 'week') {
    renderWeekGrid(container);
    renderExpandedCard(container);
    scrollTimelineToFocus(container, prevScroll);
    return;
  }
  await renderTimeline();
  renderExpandedCard(container);
  scrollTimelineToFocus(container, prevScroll);
}
