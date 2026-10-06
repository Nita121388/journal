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
  poolSearch: document.getElementById('pool-search'),

  // skills
  skillsSection: document.getElementById('skills-section'),
  skillsCount: document.getElementById('skills-count'),
  skillsToggle: document.getElementById('btn-skills-toggle'),
  skillsPanel: document.getElementById('skills-panel'),
  skillsOverall: document.getElementById('skills-overall'),
  skillsList: document.getElementById('skills-list'),
  skillsCopyAll: document.getElementById('btn-skills-copy'),
  hostStatusBtn: document.getElementById('btn-host-status'),
  hostBanner: document.getElementById('host-banner'),
  hostBannerStart: document.getElementById('host-banner-start'),
  btnPanels: document.getElementById('btn-panels'),
  board: document.getElementById('board'),
  btnQuickAdd: document.getElementById('btn-quick-add'),
  poolExtra: document.getElementById('pool-extra'),
  poolExtraFilter: document.getElementById('pool-extra-filter'),
};

// ── 应用内对话框（替代原生 prompt/confirm）──
export const appDialog = document.getElementById('app-dialog');
export const appDialogTitle = document.getElementById('app-dialog-title');
export const appDialogBody = document.getElementById('app-dialog-body');
export const appDialogActions = document.getElementById('app-dialog-actions');
export const appDialogClose = document.getElementById('app-dialog-close');

// ── 卡片编辑器 / 属性表单的静态元素（原 entries/sidepanel.js 模块级常量）──
export const editorOverlay = document.getElementById('card-editor-overlay');
export const editorDate = document.getElementById('card-editor-date');
export const editorType = document.getElementById('card-editor-type');
export const editorContent = document.getElementById('card-editor-content');
export const editorStart = document.getElementById('card-editor-start');
export const editorEnd = document.getElementById('card-editor-end');
export const editorDuration = document.getElementById('card-editor-duration');
export const editorTitle = document.getElementById('card-editor-title');
export const editorStatus = document.getElementById('card-editor-status');
export const editorProgress = document.getElementById('card-editor-progress');
export const editorProgressNumber = document.getElementById('card-editor-progress-number');
export const editorStatusCustom = document.getElementById('card-editor-status-custom');
export const editorStatusSeg = document.getElementById('card-editor-status-seg');
export const editorPriority = document.getElementById('card-editor-priority');
export const editorPrioritySeg = document.getElementById('card-editor-priority-seg');
export const editorTagChips = document.getElementById('card-editor-tag-chips');
export const btnEmojiTile = document.getElementById('btn-emoji-tile');
export const editorDurationMin = document.getElementById('card-editor-duration-min');
export const propsList = document.getElementById('card-editor-props-list');
export const btnAddProp = document.getElementById('btn-add-prop');
export const btnPropLib = document.getElementById('btn-prop-lib');
export const propForm = document.getElementById('prop-form');
export const propKey = document.getElementById('prop-key');
export const propIcon = document.getElementById('prop-icon');
export const propType = document.getElementById('prop-type');
export const propOptions = document.getElementById('prop-options');
export const propFormOk = document.getElementById('prop-form-ok');
export const propFormCancel = document.getElementById('prop-form-cancel');
export const saveTemplateBtn = document.getElementById('card-editor-save-template');
export const editorSave = document.getElementById('card-editor-save');
export const editorCancel = document.getElementById('card-editor-cancel');
export const editorClose = document.getElementById('card-editor-close');
export const editorTagInput = document.getElementById('card-editor-tag-input');
export const editorProjectInput = document.getElementById('card-editor-project');
export const editorMetaEl = document.getElementById('card-editor-meta');
export const projectSuggest = document.getElementById('project-suggest');
export const emojiPreview = document.getElementById('emoji-preview');
export const emojiPicker = document.getElementById('emoji-picker');

// ── 模板构建器 / 属性定义弹窗（原 features/template-builder.js 内联查找）──
// 之前这些元素在 template-builder.js 与 bind-editor.js 各查一遍；现集中于此。
export const tplBuilderOverlay = document.getElementById('template-builder-overlay');
export const tplBuilderTile = document.getElementById('tpl-builder-tile');
export const tplBuilderName = document.getElementById('tpl-builder-name');
export const tplBuilderEmoji = document.getElementById('tpl-builder-emoji');
export const tplBuilderPicker = document.getElementById('tpl-builder-picker');
export const tplBuilderClose = document.getElementById('tpl-builder-close');
export const tplPropList = document.getElementById('tpl-prop-list');
export const tplPrefill = document.getElementById('tpl-prefill');
export const tplCancel = document.getElementById('tpl-cancel');
export const tplSave = document.getElementById('tpl-save');
export const tplPropOverlay = document.getElementById('tpl-prop-overlay');
export const tplPropDialogTitle = document.getElementById('tpl-prop-dialog-title');
export const tplPropClose = document.getElementById('tpl-prop-close');
export const tplNpLabel = document.getElementById('tpl-np-label');
export const tplNpIcon = document.getElementById('tpl-np-icon');
export const tplNpIconTile = document.getElementById('tpl-np-icon-tile');
export const tplNpIconPreview = document.getElementById('tpl-np-icon-preview');
export const tplNpIconPicker = document.getElementById('tpl-np-icon-picker');
export const tplNpType = document.getElementById('tpl-np-type');
export const tplNpKey = document.getElementById('tpl-np-key');
export const tplNpOptions = document.getElementById('tpl-np-options');
export const tplNpOk = document.getElementById('tpl-np-ok');
export const tplNpCancel = document.getElementById('tpl-np-cancel');
