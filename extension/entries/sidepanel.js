/**
 * sidepanel.js — 主界面胶水层（卡片时间线版）
 * 职责：DOM 事件绑定 → 调用 state/repository.js → 渲染
 * 规则：不直接碰平台 storage（走 state/repository.js），不 mix storage + render；
 * 平台能力统一经 platform/index.js 的端口获取。
 */

import { todayKey, currentTime } from '../shared/model.js';
import { getSettings } from '../state/settings.js';
import { pullFromHost, startHostSync } from '../state/sync-bridge.js';
import { getPropLibrary, loadPropLibrary } from '../state/prop-library.js';
import { vs, monthOf } from '../state/view-state.js';
import { actions } from '../state/actions.js';
import {
  openEditor, closeEditor, saveEditor, updateEditorDuration,
  onEditorDurationInput, onEditorStatusChange, updateStatusSeg, onStatusClicked,
  onEditorProgressChange, openEmojiPicker, addEditorTag,
  openPropForm, closePropForm, onPropFormOk, openPropLibrary,
} from '../features/card-editor.js';
import { renderCalendarView, updateHeaderDate } from '../views/calendar.js';
import { renderCardPool } from '../views/pool.js';
import { refreshAll } from '../views/refresh.js';
import { loadPoolViews, saveCurrentView, applyView } from '../views/named-view.js';
import { skillsCache, loadSkillStatus } from '../views/skills.js';
import { startNowMarkerTimer } from '../views/timeline.js';
import { addDays, markViewMode, requestFocusScroll, renderRightView } from '../views/rightview.js';
import { getPort } from '../platform/index.js';
import {
  els,
  editorOverlay, editorStart, editorEnd, editorStatus, editorProgress, editorProgressNumber, editorStatusCustom, editorDurationMin, btnAddProp, btnPropLib, propType, propOptions, propFormOk, propFormCancel, saveTemplateBtn, editorSave, editorCancel, editorClose, editorTagInput,
} from '../components/dom-refs.js';
import { showToast } from '../features/toast.js';
import { checkHostHealth, startHost } from '../features/host-status.js';
import { WIDE_QUERY, WIDE_STATE_KEY, widePreference, applyWide } from '../features/wide-mode.js';
import {
  tplNpType, tplNpOptions, tplPropOverlay,
  closeTplPropDialog, closeTemplateBuilder, saveTemplateBuilder, prefillTemplateFromCard,
  onTplNewPropOk, toggleTplBuilderPicker, openTemplateMenu, saveEditorAsTemplate,
  fieldPickerEl, closeFieldPicker, propRowMenuEl, closePropRowMenu,
  rowIconPop, closeRowIconPicker,
} from '../features/template-builder.js';
import { autoEnhance as enhanceSelects } from '../features/select.js';
import { initFieldRegistry } from '../shared/field-registry.js';

/* ─── 工具函数 ──────────────────────────────────────── */

// formatDateLabel / shortDate / typeIcon 已提取到 shared/format.js（见顶部 import）。
// 纯展示格式化，供 views 与 entry 共用。

/* ─── 状态 ──────────────────────────────────────────── */
// 视图可变状态已集中到 state/view-state.js（`vs`），见顶部 import。

/* ─── 卡片编辑器 ──────────────────────────────────────── */

editorTagInput?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  addEditorTag(editorTagInput.value);
  editorTagInput.value = '';
});

/** 编辑器当前选择的 emoji（'' = 用类型默认图标） */
/* ─── 卡片编辑器 ──────────────────────────────────────── */
// 已提取到 features/card-editor.js（见顶部 import）。



/* ─── Toast 提示 ────────────────────────────────────── */
// 已提取到 features/toast.js（见顶部 import）。

/* ─── DOM 引用 ────────────────────────────────────────── */
// 已提取到 components/dom-refs.js（见顶部 import）。

// 已提取到 features/host-status.js（见顶部 import）。



/* ─── 渲染：右视图（月历 / 周历 / 日程） ──────────────────────────────── */

/** dayKey ± n 天 → dayKey（本地时区） */
/* ─── 渲染：右视图（月历 / 周历 / 日程调度）───────────────── */
// 已提取到 views/rightview.js（见顶部 import）。



/* ─── 渲染：时间线 ──────────────────────────────────────── */
// 已提取到 views/timeline.js（见顶部 import）。



/* ─── 渲染：统一卡片池（文本/待办统一，待办只是状态筛选） ─────── */

/* ─── 渲染：统一卡片池 ─────────────────────────────────── */
// 已提取到 views/pool.js（见顶部 import）。

/* ─── 渲染：热力图 ──────────────────────────────────────── */

/* ─── 渲染：热力图 / 日历 ──────────────────────────────── */
// 已提取到 views/heatmap.js 与 views/calendar.js（见顶部 import）。

/* ─── 渲染：TODO ──────────────────────────────────────── */

/* ─── 全局刷新 ────────────────────────────────────────── */

// 已提取到 views/refresh.js（见顶部 import）。



/* ─── 命名视图 ────────────────────────────────────────── */

/** 从 host 拉取命名视图并渲染到下拉 */
// 已提取到 views/named-view.js（见顶部 import）。



/* ─── 模板构建器 ───────────────────────────────────── */

// 已提取到 features/template-builder.js（见顶部 import）。



/* ─── 本机 Skills ────────────────────────────────────── */

// 已提取到 views/skills.js（见顶部 import）。



/* ─── 初始化 ────────────────────────────────────────── */

// 已提取到 features/wide-mode.js（见顶部 import）。



async function init() {
  // 自建下拉框（BoardUI 风格）：增强静态 select；动态生成由全局 observer 自动接管
  enhanceSelects();

  // 主题
  const settings = await getSettings();
  if (settings.theme === 'dark' ||
      (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.dataset.theme = 'dark';
  }

  // 宽屏模式（初始 + 视口变化时跟随）
  applyWide();
  WIDE_QUERY.addEventListener('change', () => {
    // 非手动模式才需要跟随视口变化
    const p = widePreference();
    if (p !== 'on' && p !== 'off') applyWide();
  });

  // 侧栏抽屉（窄栏默认收起；宽屏时 CSS 自动隐藏按钮）
  const setPanels = (open) => {
    document.body.classList.toggle('panels-open', open);
    els.btnPanels.setAttribute('aria-expanded', String(open));
  };
  setPanels(getPort().prefGet('journal.panelsOpen') === '1');
  els.btnPanels.addEventListener('click', () => {
    const open = !document.body.classList.contains('panels-open');
    setPanels(open);
    getPort().prefSet('journal.panelsOpen', open ? '1' : '0');
  });
  // 点击遮罩关闭抽屉
  els.board?.addEventListener?.('click', (e) => {
    if (e.target === els.board) setPanels(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('panels-open')) {
      setPanels(false);
      els.btnPanels.focus();
    }
  });

  // 快捷新建（今天/当前视图日期）
  els.btnQuickAdd?.addEventListener('click', () => {
    openEditor(null, currentTime(), vs.selectedDate);
  });

  // 项目/标签筛选：展开/收起「筛选」区（渐进披露）
  if (els.poolExtraFilter && els.poolExtra) {
    const setExtra = (open) => {
      els.poolExtra.classList.toggle('is-open', open);
      els.poolExtraFilter.setAttribute('aria-expanded', String(open));
    };
    els.poolExtraFilter.addEventListener('click', () => setExtra(!els.poolExtra.classList.contains('is-open')));
  }

  // 拉取 host 数据
  const pulled = await pullFromHost();
  if (!pulled.pulled) {
    showToast('⚠️ host 服务未连接，数据可能无法保存', 'warn');
  }
  await checkHostHealth();
  startHostSync(() => {
    // 拖拽/缩放中不打断；其余情况外部变化就全量重渲染
    if (document.body.classList.contains('is-dragging') ||
        document.body.classList.contains('is-resizing')) return;
    refreshAll();
  });

  // 首次全量渲染
  updateHeaderDate();
  markViewMode();
  requestFocusScroll(); // 打开时聚焦当前时刻
  await refreshAll();
  await loadPoolViews();

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

  // 今日当前时间 marker 每分钟更新
  startNowMarkerTimer();

  // ── 宽屏模式：三态循环 auto → on → off → auto ──
  els.btnWide?.addEventListener('click', () => {
    const order = ['auto', 'on', 'off'];
    const cur = widePreference() || 'auto';
    const next = order[(order.indexOf(cur) + 1) % order.length] || 'auto';
    if (next === 'auto') getPort().prefRemove(WIDE_STATE_KEY);
    else getPort().prefSet(WIDE_STATE_KEY, next);
    applyWide();
  });

  // ── 编辑器事件 ──
  // ── 键盘快捷键（Esc 关闭 / ⌘⏎ 保存） ──
  document.addEventListener('keydown', (e) => {
    const tplOv = document.getElementById('template-builder-overlay');
    const cardOpen = editorOverlay && !editorOverlay.classList.contains('hidden');
    const tplOpen = tplOv && !tplOv.classList.contains('hidden');
    if (!cardOpen && !tplOpen) return;
    // 属性行右键菜单 / 图标浮层 / 字段选择浮层开着时，Esc 只关浮层
    if (propRowMenuEl && e.key === 'Escape') {
      e.preventDefault(); closePropRowMenu(); return;
    }
    if (fieldPickerEl && e.key === 'Escape') {
      e.preventDefault(); closeFieldPicker(); return;
    }
    if (rowIconPop && e.key === 'Escape') {
      e.preventDefault(); closeRowIconPicker(); return;
    }
    // 属性编辑弹窗开着时，Esc 先关弹窗
    const propOpen = tplPropOverlay && !tplPropOverlay.classList.contains('hidden');
    if (propOpen && e.key === 'Escape') {
      e.preventDefault(); closeTplPropDialog(); return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (tplOpen) closeTemplateBuilder(); else closeEditor();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (tplOpen) void saveTemplateBuilder(); else void saveEditor();
    }
  });
  editorSave.addEventListener('click', saveEditor);
  editorCancel.addEventListener('click', closeEditor);
  editorClose.addEventListener('click', closeEditor);
  editorStart?.addEventListener('change', updateEditorDuration);
  editorEnd?.addEventListener('change', updateEditorDuration);
  editorDurationMin?.addEventListener('change', onEditorDurationInput);
  editorStatus?.addEventListener('change', onEditorStatusChange);
  // 分段状态胶囊
  document.getElementById('card-editor-status-seg')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg');
    if (btn?.dataset.status) onStatusClicked(btn.dataset.status);
  });
  // 自定义状态：输入即设为自定义状态，清空回退纯记录
  editorStatusCustom?.addEventListener('input', (e) => {
    const v = e.target.value.trim();
    if (v) { editorStatus.value = v; updateStatusSeg(v); onEditorStatusChange(); }
    else { editorStatus.value = 'none'; updateStatusSeg('none'); onEditorStatusChange(); }
  });
  // 进度：手输数值（滑块/手输双向）
  editorProgressNumber?.addEventListener('change', () => {
    const p = Math.max(0, Math.min(100, Math.round(Number(editorProgressNumber.value) || 0)));
    if (editorProgress) editorProgress.value = p;
    onEditorProgressChange();
  });
  // 点击头部图标瓦片打开 emoji picker
  document.getElementById('btn-emoji-tile')?.addEventListener('click', openEmojiPicker);
  editorProgress?.addEventListener('change', onEditorProgressChange);
  editorProgress?.addEventListener('input', onEditorProgressChange);
  btnAddProp?.addEventListener('click', openPropForm);
  btnPropLib?.addEventListener('click', openPropLibrary);
  propFormCancel?.addEventListener('click', closePropForm);
  propFormOk?.addEventListener('click', onPropFormOk);
  propType?.addEventListener('change', () => {
    const wrap = propOptions?.closest('.prop-options-wrap');
    if (wrap) wrap.classList.toggle('hidden', propType.value !== 'select' && propType.value !== 'multi');
  });
  saveTemplateBtn?.addEventListener('click', saveEditorAsTemplate);
  editorOverlay.addEventListener('click', (e) => {
    if (e.target === editorOverlay) saveEditor();
  });
  await loadPropLibrary();
  // 字段注册表：用户字段走 getter 实时读 propLibrary，变更后无需重新 init
  initFieldRegistry({ getUserFields: () => getPropLibrary() });

  // ── 卡片池新建 ──
  els.btnNewCard.addEventListener('click', () => {
    // 直接开空白编辑器，保存时才落库（assignedDate = null → 未安排），取消不产生空卡片
    openEditor(null, currentTime(), null, null);
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

  // ── 卡片池：模板（阶段 D） ──
  els.btnTemplate?.addEventListener('click', openTemplateMenu);

  // ── 模板构建器事件 ──
  document.getElementById('tpl-builder-close')?.addEventListener('click', closeTemplateBuilder);
  document.getElementById('tpl-cancel')?.addEventListener('click', closeTemplateBuilder);
  document.getElementById('tpl-save')?.addEventListener('click', saveTemplateBuilder);
  document.getElementById('tpl-prefill')?.addEventListener('click', prefillTemplateFromCard);
  document.getElementById('tpl-builder-tile')?.addEventListener('click', toggleTplBuilderPicker);
  document.getElementById('tpl-np-ok')?.addEventListener('click', onTplNewPropOk);
  document.getElementById('tpl-np-cancel')?.addEventListener('click', closeTplPropDialog);
  document.getElementById('tpl-np-type')?.addEventListener('change', () => {
    const wrap = tplNpOptions?.closest('.prop-options-wrap');
    if (wrap) wrap.classList.toggle('hidden', tplNpType.value !== 'select' && tplNpType.value !== 'multi');
  });
  document.getElementById('template-builder-overlay')?.addEventListener('click', (e) => {
    // 点击外部关闭；点击瓦片容器内的 emoji picker 不关
    const path = e.composedPath ? e.composedPath() : [e.target];
    if (path.some(el => el?.classList?.contains('ce-tile-wrap') || el?.classList?.contains('template-builder'))) return;
    closeTemplateBuilder();
  });
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    getPort().openOptionsPage();
  });

  els.hostStatusBtn?.addEventListener('click', startHost);

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
  await loadSkillStatus();

  // ── 外部存储变更刷新 ──
  // 已被 startHostSync（host → 缓存 → 重渲染）取代，storage.onChanged 会在上面的回调里统一刷新
}

// 组合根把「全量重渲染」与「打开编辑器」注入 state/actions.js，
// 供各视图/功能反向调用（避免 views → entries 循环依赖）。
actions.refreshAll = refreshAll;
actions.openEditor = openEditor;
actions.updateEditorDuration = updateEditorDuration;

init().catch(err => console.error('[journal] init failed:', err));
