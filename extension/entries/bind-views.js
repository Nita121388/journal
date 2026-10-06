/**
 * bind-views.js — 视图导航与视图内交互装配（entries 层）
 *
 * 右视图（日/周/月）前后与「今天」、视图模式切换、时间线范围切换、宽屏切换、
 * 左侧日历导航与点选、热力图点选、卡片池布局/命名视图/模板入口、Skills 面板。
 */

import { els } from '../components/dom-refs.js';
import { getPort } from '../platform/index.js';
import { todayKey, currentTime } from '../shared/model.js';
import { vs, monthOf } from '../state/view-state.js';
import { actions } from '../state/actions.js';
import { showToast } from '../features/toast.js';
import { WIDE_STATE_KEY, widePreference, applyWide } from '../features/wide-mode.js';
import { renderCalendarView, updateHeaderDate } from '../views/calendar.js';
import { applyView, saveCurrentView } from '../views/named-view.js';
import { renderCardPool } from '../views/pool.js';
import { addDays, markViewMode, renderRightView, requestFocusScroll } from '../views/rightview.js';
import { skillsCache, loadSkillStatus } from '../views/skills.js';
import { openTemplateMenu } from '../features/template-menu.js';

/** 绑定视图级交互。 */
export function bindViews() {
  // ── 右视图导航 / 模式切换 ──
  els.viewPrev.addEventListener('click', async () => {
    requestFocusScroll(); // 切换日期后聚焦
    if (vs.viewMode === 'month') {
      let { year, month } = vs.calendarMonth;
      month -= 1;
      if (month < 0) { month = 11; year -= 1; }
      vs.calendarMonth = { year, month };
      renderCalendarView();
    } else if (vs.viewMode === 'week') {
      vs.weekAnchor = addDays(vs.weekAnchor, -7);
    } else {
      vs.selectedDate = addDays(vs.selectedDate, -1);
      vs.weekAnchor = vs.selectedDate;
      vs.calendarMonth = monthOf(vs.selectedDate);
      updateHeaderDate();
      renderCalendarView();
    }
    await renderRightView();
  });

  els.viewNext.addEventListener('click', async () => {
    requestFocusScroll(); // 切换日期后聚焦
    if (vs.viewMode === 'month') {
      let { year, month } = vs.calendarMonth;
      month += 1;
      if (month > 11) { month = 0; year += 1; }
      vs.calendarMonth = { year, month };
      renderCalendarView();
    } else if (vs.viewMode === 'week') {
      vs.weekAnchor = addDays(vs.weekAnchor, 7);
    } else {
      vs.selectedDate = addDays(vs.selectedDate, 1);
      vs.weekAnchor = vs.selectedDate;
      vs.calendarMonth = monthOf(vs.selectedDate);
      updateHeaderDate();
      renderCalendarView();
    }
    await renderRightView();
  });

  els.viewToday.addEventListener('click', async () => {
    requestFocusScroll(); // 切换日期后聚焦
    vs.calendarMonth = monthOf(todayKey());
    vs.weekAnchor = todayKey();
    vs.selectedDate = todayKey();
    updateHeaderDate();
    renderCalendarView();
    await renderRightView();
  });

  els.viewModeBtns?.forEach(btn => {
    btn.addEventListener('click', async () => {
      vs.viewMode = btn.dataset.mode;
      getPort().prefSet('journal.viewMode', vs.viewMode);
      markViewMode();
      requestFocusScroll(); // 切换视图后重新聚焦当前时刻
      await renderRightView();
    });
  });

  // 24h / 08-22 时间线范围切换
  const updateSpanBtn = () => {
    if (els.btnSpan) els.btnSpan.textContent = vs.timelineSpan === 'full' ? '24h' : '08–22';
  };
  updateSpanBtn();
  els.btnSpan?.addEventListener('click', async () => {
    vs.timelineSpan = vs.timelineSpan === 'full' ? 'default' : 'full';
    getPort().prefSet('journal.timelineSpan', vs.timelineSpan);
    updateSpanBtn();
    // 时间范围影响时间线与周视图（周视图复用同一天范围逻辑）
    await renderRightView();
  });

  // ── 宽屏模式：三态循环 auto → on → off → auto ──
  els.btnWide?.addEventListener('click', () => {
    const order = ['auto', 'on', 'off'];
    const cur = widePreference() || 'auto';
    const next = order[(order.indexOf(cur) + 1) % order.length] || 'auto';
    if (next === 'auto') getPort().prefRemove(WIDE_STATE_KEY);
    else getPort().prefSet(WIDE_STATE_KEY, next);
    applyWide();
  });

  // ── 日历月份导航（左侧小日历）──
  els.calPrev.addEventListener('click', () => {
    let { year, month } = vs.calendarMonth;
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
    vs.calendarMonth = { year, month };
    renderCalendarView();
    if (vs.viewMode === 'month') renderRightView();
  });

  els.calNext.addEventListener('click', () => {
    let { year, month } = vs.calendarMonth;
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    vs.calendarMonth = { year, month };
    renderCalendarView();
    if (vs.viewMode === 'month') renderRightView();
  });

  els.calToday.addEventListener('click', async () => {
    vs.calendarMonth = monthOf(todayKey());
    vs.selectedDate = todayKey();
    vs.weekAnchor = todayKey();
    updateHeaderDate();
    renderCalendarView();
    await renderRightView();
  });

  // ── 日历点击切换日期 ──
  els.calendarGrid.addEventListener('click', async (e) => {
    const cell = e.target.closest('.cal-day');
    if (!cell || !cell.dataset.day) return;
    vs.selectedDate = cell.dataset.day;
    vs.weekAnchor = cell.dataset.day;
    updateHeaderDate();
    renderCalendarView();
    await renderRightView();
  });

  // ── 热力图点击切换日期 ──
  els.heatmap.addEventListener('click', (e) => {
    const cell = e.target.closest('.heatmap-cell');
    if (!cell || !cell.dataset.day) return;
    vs.selectedDate = cell.dataset.day;
    vs.weekAnchor = cell.dataset.day;
    // 跳到对应月份
    vs.calendarMonth = monthOf(cell.dataset.day);
    updateHeaderDate();
    renderCalendarView();
    renderRightView();
  });

  // ── 卡片池：新建卡片（直接开空白编辑器，保存时才落库）──
  els.btnNewCard.addEventListener('click', () => {
    actions.openEditor(null, currentTime(), null, null);
  });

  // ── 卡片池：布局切换（卡片视图 / 列表视图） ──
  els.poolLayoutBtn?.addEventListener('click', () => {
    vs.poolLayout = vs.poolLayout === 'card' ? 'list' : 'card';
    getPort().prefSet('journal.poolLayout', vs.poolLayout);
    els.poolLayoutBtn.textContent = vs.poolLayout === 'card' ? '⊞' : '☰';
    renderCardPool();
  });

  // ── 卡片池：命名视图（保存 / 切换） ──
  els.saveViewBtn?.addEventListener('click', saveCurrentView);
  els.viewSelect?.addEventListener('change', () => {
    const id = els.viewSelect.value;
    const view = vs.savedViews.find(v => v.id === id);
    if (view) applyView(view);
  });

  // ── 卡片池：模板 ──
  els.btnTemplate?.addEventListener('click', openTemplateMenu);

  // ── AI Skill 状态 ──
  els.skillsToggle.addEventListener('click', () => {
    const isOpen = !els.skillsPanel.classList.contains('hidden');
    els.skillsPanel.classList.toggle('hidden', isOpen);
    els.skillsToggle.classList.toggle('open', !isOpen);
    if (!isOpen && !skillsCache) loadSkillStatus();
  });
  els.skillsCopyAll.addEventListener('click', async () => {
    if (!skillsCache) return;
    const text = skillsCache.locations.map(l => l.path).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast('✅ 已复制全部路径', 'success');
    } catch (e) {
      showToast('复制失败，请手动复制', 'error');
    }
  });
}
