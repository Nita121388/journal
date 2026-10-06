/**
 * dom-refs.js — DOM 元素注册表（components 层）
 *
 * sidepanel.html 中所有被 JS 引用的静态元素集中在此，避免散落的 getElementById。
 * 纯查找，不含行为；不依赖任何其他层。
 *
 * 注意：`viewModeBtns` 是 NodeList（querySelectorAll），不是单个元素。
 */

export const els = {
  todayDisplay: document.getElementById('today-display'),
  heatmap: document.getElementById('heatmap-container'),
  heatmapStreak: document.getElementById('heatmap-streak'),
  calPrev: document.getElementById('cal-prev'),
  calNext: document.getElementById('cal-next'),
  calToday: document.getElementById('cal-today'),
  calMonthLabel: document.getElementById('cal-month-label'),
  calendarGrid: document.getElementById('calendar-grid'),
  timelineContainer: document.getElementById('timeline-container'),
  timelineDateHeader: document.getElementById('timeline-date-header'),
  viewPrev: document.getElementById('view-prev'),
  viewNext: document.getElementById('view-next'),
  viewToday: document.getElementById('view-today'),
  viewModeBtns: document.querySelectorAll('.view-mode-btn'),
  btnSpan: document.getElementById('btn-span'),
  btnWide: document.getElementById('btn-wide-mode'),
  cardpoolList: document.getElementById('cardpool-list'),
  cardpoolCount: document.getElementById('cardpool-count'),
  btnNewCard: document.getElementById('btn-new-card'),
  btnTemplate: document.getElementById('btn-template'),
  poolLayoutBtn: document.getElementById('btn-pool-layout'),
  saveViewBtn: document.getElementById('btn-save-view'),
  viewSelect: document.getElementById('pool-view-select'),
  poolFilterRow: document.getElementById('pool-filter-row'),

  // skills
  skillsSection: document.getElementById('skills-section'),
  skillsCount: document.getElementById('skills-count'),
  skillsToggle: document.getElementById('btn-skills-toggle'),
  skillsPanel: document.getElementById('skills-panel'),
  skillsOverall: document.getElementById('skills-overall'),
  skillsList: document.getElementById('skills-list'),
  skillsCopyAll: document.getElementById('btn-skills-copy'),
  hostStatusBtn: document.getElementById('btn-host-status'),
  btnPanels: document.getElementById('btn-panels'),
  board: document.getElementById('board'),
  btnQuickAdd: document.getElementById('btn-quick-add'),
  poolExtra: document.getElementById('pool-extra'),
  poolExtraFilter: document.getElementById('pool-extra-filter'),
};
