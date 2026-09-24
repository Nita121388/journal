/**
 * sidepanel.js — 主界面胶水层（卡片时间线版）
 * 职责：DOM 事件绑定 → 调用 lib/store.js → 渲染
 * 规则：不直接碰 chrome.storage.*（走 lib/store.js），不 mix storage + render
 */

import {
  todayKey, currentTime, aggregateHeatmap,
  countCardsByDay, groupCardsForTimeline, getCardTypeCounts,
  todoSummary, dateRange, getMonthMatrix, toDayKey,
  timeToMinutes, minutesToTime, addMinutes, snapToQuarter, snapUpToQuarter,
  getCardStartTime, getCardEndTime, getCardDuration, layoutScheduleLanes,
} from './lib/model.js';
import {
  getAllCards, getCardsByDay, getPoolCards, getHeatmapData,
  createCardEntry, updateCardEntry, deleteCardEntry,
  getTodos, saveTodos, getSettings,
} from './lib/store.js';
import { pullFromHost, startHostSync } from './lib/host-sync.js';

/* ─── 工具函数 ──────────────────────────────────────── */

function debounce(fn, ms = 500) {
  let timer = null;
  const wrapped = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  wrapped.cancel = () => { clearTimeout(timer); timer = null; };
  return wrapped;
}

function genId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

function isOverdue(due) { return due != null && due < todayKey(); }

function monthOf(dayKey) {
  const [y, m] = dayKey.split('-').map(Number);
  return { year: y, month: m - 1 };
}

function formatDateLabel(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
}

/** 渲染字数 */
function wordCount(text) { return text ? text.length : 0; }

/** 渲染今天/昨天/具体日期 */
function shortDate(dayKey) {
  const t = todayKey();
  if (dayKey === t) return '今天';
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey === yesterday.toISOString().slice(0, 10)) return '昨天';
  return dayKey;
}

/** 类型图标 */
function typeIcon(type) {
  return type === 'task' ? '☑️' : type === 'idea' ? '💡' : '📝';
}

/* ─── 状态 ──────────────────────────────────────────── */

let selectedDate = todayKey();
let calendarMonth = monthOf(todayKey());
let heatmapCache = {};
let allCardsCache = [];
let switchSeq = 0;

/** @type {'month'|'week'|'timeline'} 右侧主视图模式 */
let viewMode = localStorage.getItem('journal.viewMode') || 'timeline';
/** 周历的基准日期（该周的某一天） */
let weekAnchor = selectedDate;
/** @type {'default'|'full'} 时间线展示范围：默认 08-22，full=24 小时 */
let timelineSpan = localStorage.getItem('journal.timelineSpan') || 'default';

/** @type {'active'|'all'|'done'} */
let todoFilter = 'active';
/** @type {Array} */
let todosCache = [];

/* ─── 卡片编辑器 ──────────────────────────────────────── */

const editorOverlay = document.getElementById('card-editor-overlay');
const editorTime = document.getElementById('card-editor-time');
const editorType = document.getElementById('card-editor-type');
const editorContent = document.getElementById('card-editor-content');
const editorStart = document.getElementById('card-editor-start');
const editorEnd = document.getElementById('card-editor-end');
const editorDuration = document.getElementById('card-editor-duration');
const editorSave = document.getElementById('card-editor-save');
const editorCancel = document.getElementById('card-editor-cancel');
const editorClose = document.getElementById('card-editor-close');
const editorTagInput = document.getElementById('card-editor-tag-input');
const editorProjectInput = document.getElementById('card-editor-project');
const editorMetaEl = document.getElementById('card-editor-meta');
const projectSuggest = document.getElementById('project-suggest');
editorTagInput?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  addEditorTag(editorTagInput.value);
  editorTagInput.value = '';
});

/** 正在编辑的卡片 ID（null = 新建模式） */
let editingCardId = null;
/** 编辑器打开时的目标时间 */
let editorTargetTime = null;
/** 新建时的安排日期：undefined = 用 selectedDate，null = 未安排（卡片池） */
let editorAssignDate;

/**
 * 打开卡片编辑器
 * @param {object|null} card — null = 新建，否则编辑
 * @param {string} time — HH:MM（新建时作为开始时间的种子）
 * @param {string|null} date — YYYY-MM-DD
 */
let editorTags = [];

function renderEditorTags() {
  const box = document.getElementById('card-editor-tag-chips');
  if (!box) return;
  box.replaceChildren();
  for (const name of editorTags) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag-chip';
    chip.textContent = name + ' ×';
    chip.addEventListener('click', () => {
      editorTags = editorTags.filter(t => t !== name);
      renderEditorTags();
    });
    box.append(chip);
  }
}

function addEditorTag(raw) {
  const name = String(raw ?? '').trim().toLowerCase();
  if (!name || editorTags.includes(name)) return;
  editorTags.push(name);
  renderEditorTags();
}

const ORIGIN_LABEL = {
  human: '👤 人类',
  'agent-assisted': '🤖 人类驱动 agent',
  'agent-auto': '⚙️ 自动',
};

/** 来源事件 → 展示文案 */
function formatProvenance(ev, fallback = '—') {
  if (!ev) return fallback;
  const label = ORIGIN_LABEL[ev.origin] ?? '👤 人类';
  const parts = [label];
  if (ev.agent) parts.push(ev.agent);
  if (ev.model) parts.push(ev.model);
  if (ev.project) parts.push(ev.project);
  if (ev.device?.hostname) parts.push(ev.device.hostname);
  if (ev.at) parts.push(new Date(ev.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }));
  return parts.join(' · ');
}

/** 历史项目目录（用于 datalist 建议） */
function collectProjects() {
  const set = new Set();
  for (const c of allCardsCache ?? []) {
    const p = c.meta?.createdBy?.project ?? c.meta?.updatedBy?.project;
    if (p) set.add(p);
  }
  return [...set].sort();
}

function renderProjectSuggest() {
  if (!projectSuggest) return;
  projectSuggest.replaceChildren();
  for (const p of collectProjects()) {
    const o = document.createElement('option');
    o.value = p;
    projectSuggest.append(o);
  }
}

function openEditor(card, time, date, assignedDate = undefined) {
  editingCardId = card?.id ?? null;
  editorTags = Array.isArray(card?.tags) ? [...card.tags] : [];
  renderEditorTags();
  editorAssignDate = assignedDate;
  let start, end;
  if (card) {
    start = getCardStartTime(card) ?? snapToQuarter(currentTime());
    end = getCardEndTime(card) ?? addMinutes(start, 15);
  } else {
    start = snapUpToQuarter(time ?? currentTime());
    end = addMinutes(start, 15);
  }
  editorTargetTime = start;
  if (editorStart) editorStart.value = start;
  if (editorEnd) editorEnd.value = end;
  updateEditorDuration();
  editorTime.textContent = date ?? (assignedDate === null ? '未安排' : selectedDate);
  editorType.value = card?.type ?? 'text';
  editorContent.value = card?.content ?? '';

  // 项目：已有卡片取现有值，否则取上次用过的
  const lastProject = localStorage.getItem('journal.lastProject') ?? '';
  const cardProject = (editingCardId ? (allCardsCache.find(c => c.id === editingCardId)?.meta?.updatedBy ?? null) : null)
    ?.project ?? (editingCardId ? allCardsCache.find(c => c.id === editingCardId)?.meta?.createdBy?.project ?? null : null);
  if (editorProjectInput) editorProjectInput.value = cardProject ?? lastProject ?? '';
  renderProjectSuggest();

  // 来源：仅编辑已有卡片时展示
  if (editorMetaEl) {
    const existing = editingCardId ? allCardsCache.find(c => c.id === editingCardId) : null;
    const m = existing?.meta ?? null;
    editorMetaEl.textContent = m
      ? `创建：${formatProvenance(m.createdBy)}　修改：${formatProvenance(m.updatedBy)}`
      : '';
  }

  editorOverlay.classList.remove('hidden');
  editorContent.focus();
}

/** 编辑器持续时长显示 */
function updateEditorDuration() {
  if (!editorDuration) return;
  const s = editorStart?.value;
  const e = editorEnd?.value;
  if (!s || !e) { editorDuration.textContent = ''; return; }
  const dur = Math.max(0, timeToMinutes(e) - timeToMinutes(s));
  editorDuration.textContent = dur > 0 ? `${dur} 分钟` : '结束须晚于开始';
}

function closeEditor() {
  editorOverlay.classList.add('hidden');
  editingCardId = null;
  editorAssignDate = undefined;
  editorContent.value = '';
  editorTags = [];
  renderEditorTags();
  const tagInput = document.getElementById('card-editor-tag-input');
  if (tagInput) tagInput.value = '';
  if (editorStart) editorStart.value = '';
  if (editorEnd) editorEnd.value = '';
  if (editorDuration) editorDuration.textContent = '';
  if (editorMetaEl) editorMetaEl.textContent = '';
}

async function saveEditor() {
  const content = editorContent.value.trim();
  const type = editorType.value;
  const pendingTag = document.getElementById('card-editor-tag-input')?.value;
  if (pendingTag) addEditorTag(pendingTag);
  if (!content && !editingCardId) { closeEditor(); return; }

  let start = snapToQuarter(editorStart?.value || editorTargetTime || currentTime());
  let end = snapToQuarter(editorEnd?.value || addMinutes(start, 15));
  if (timeToMinutes(end) <= timeToMinutes(start)) end = addMinutes(start, 15);

  try {
    // 项目目录：本次填写的（记住供下次预填）
    const project = editorProjectInput?.value?.trim() ?? '';
    if (project) localStorage.setItem('journal.lastProject', project);
    const provenance = { origin: 'human', project };

    if (editingCardId) {
      await updateCardEntry(editingCardId, { content, type, time: start, startTime: start, endTime: end, tags: editorTags, provenance });
    } else {
      await createCardEntry({
        content,
        type,
        assignedDate: editorAssignDate === undefined ? selectedDate : editorAssignDate,
        time: start,
        startTime: start,
        endTime: end,
        tags: editorTags,
        provenance,
      });
    }
    closeEditor();
    await refreshAll();
  } catch (e) {
    console.error('[journal] save card failed:', e);
    showToast('保存失败：host 服务未连接（127.0.0.1:8765）', 'error');
  }
}

/* ─── Toast 提示 ────────────────────────────────────── */

let toastTimer = null;
function showToast(msg, kind = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast' + (kind ? ' toast-' + kind : '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), kind === 'error' ? 12000 : 2600);
}

/* ─── DOM 引用 ────────────────────────────────────────── */

const els = {
  todayDisplay: document.getElementById('today-display'),
  heatmap: document.getElementById('heatmap-container'),
  heatmapStreak: document.getElementById('heatmap-streak'),
  todoInput: document.getElementById('todo-input'),
  todoPriority: document.getElementById('todo-priority'),
  todoDue: document.getElementById('todo-due'),
  todoList: document.getElementById('todo-list'),
  todoStats: document.getElementById('todo-stats'),
  todoFilters: document.querySelectorAll('.todo-filter'),
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
  cardpoolList: document.getElementById('cardpool-list'),
  cardpoolCount: document.getElementById('cardpool-count'),
  btnNewCard: document.getElementById('btn-new-card'),

  // skills
  skillsSection: document.getElementById('skills-section'),
  skillsCount: document.getElementById('skills-count'),
  skillsToggle: document.getElementById('btn-skills-toggle'),
  skillsPanel: document.getElementById('skills-panel'),
  skillsOverall: document.getElementById('skills-overall'),
  skillsList: document.getElementById('skills-list'),
  skillsCopyAll: document.getElementById('btn-skills-copy'),
  hostBanner: document.getElementById('host-banner'),
  hostBannerText: document.getElementById('host-banner-text'),
  btnStartHost: document.getElementById('btn-start-host'),
};

const HOST_HEALTH_URL = 'http://127.0.0.1:8765/api/health';

async function checkHostHealth() {
  try {
    const res = await fetch(HOST_HEALTH_URL, { signal: AbortSignal.timeout(1200) });
    const data = await res.json();
    const online = data.ok || data.status === 'running';
    els.hostBanner?.classList.toggle('hidden', online);
    return online;
  } catch {
    els.hostBanner?.classList.remove('hidden');
    return false;
  }
}

async function waitForHost(timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await checkHostHealth()) return true;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

async function startHost() {
  if (!els.btnStartHost) return;
  els.btnStartHost.disabled = true;
  if (els.hostBannerText) els.hostBannerText.textContent = '正在启动 Host…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'journal:start-host' });
    if (!result?.ok) throw new Error(result?.error || 'Native Host 未注册，请先运行 host\\install-host.bat');
    const online = await waitForHost();
    if (!online) throw new Error('启动超时，请确认已运行 host\\install-host.bat');
    await pullFromHost();
    await refreshAll();
    showToast('Host 已启动', 'success');
  } catch (e) {
    els.hostBanner?.classList.remove('hidden');
    if (els.hostBannerText) els.hostBannerText.textContent = 'Host 未连接';
    showToast(`启动失败：${e.message || '请先运行 host\\install-host.bat'}`, 'error');
  } finally {
    if (els.btnStartHost) els.btnStartHost.disabled = false;
  }
}

/* ─── 渲染：右视图（月历 / 周历 / 日程） ──────────────────────────────── */

/** dayKey ± n 天 → dayKey（本地时区） */
function addDays(dayKey, n) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toDayKey(dt);
}

/** 右侧头部标题文案 */
function viewHeaderLabel() {
  if (viewMode === 'month') {
    const { year, month } = calendarMonth;
    return `${year}年${month + 1}月`;
  }
  if (viewMode === 'week') {
    const [y, m, d] = weekAnchor.split('-').map(Number);
    const sun = new Date(y, m - 1, d); sun.setDate(sun.getDate() - sun.getDay());
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    return `${toDayKey(sun).slice(5).replace('-', '/')} – ${toDayKey(sat).slice(5).replace('-', '/')} · ${toDayKey(sun).slice(0, 4)}`;
  }
  const date = selectedDate;
  const typeCounts = getCardTypeCounts(allCardsCache, date);
  const parts = [];
  if (typeCounts.text) parts.push(`${typeCounts.text}📝`);
  if (typeCounts.task) parts.push(`${typeCounts.task}☑️`);
  if (typeCounts.idea) parts.push(`${typeCounts.idea}💡`);
  const countStr = parts.length ? ` · ${parts.join(' ')}` : ' · 无卡片';
  return `📅 ${formatDateLabel(date)}${countStr}`;
}

/** 同步取某天卡片（从缓存，按时间排序） */
function getCardsByDaySync(date) {
  if (!Array.isArray(allCardsCache)) return [];
  return allCardsCache
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
function markViewMode() {
  els.viewModeBtns?.forEach(b => b.classList.toggle('is-active', b.dataset.mode === viewMode));
}

/** 右侧视图统一入口 */
async function renderRightView() {
  markViewMode();
  if (els.timelineDateHeader) els.timelineDateHeader.textContent = viewHeaderLabel();
  const container = els.timelineContainer;
  container.replaceChildren();
  if (viewMode === 'month') { renderMonthGrid(container); return; }
  if (viewMode === 'week') { renderWeekGrid(container); return; }
  await renderTimeline();
}

/** 月历网格 */
function renderMonthGrid(container) {
  const matrix = getMonthMatrix(calendarMonth.year, calendarMonth.month);
  const weekday = document.createElement('div');
  weekday.className = 'calview-weekdays';
  for (const name of ['日', '一', '二', '三', '四', '五', '六']) {
    const s = document.createElement('span');
    s.textContent = name;
    weekday.append(s);
  }
  const grid = document.createElement('div');
  grid.className = 'calview-month-grid';
  const today = todayKey();
  for (const week of matrix) {
    for (const cell of week) {
      const dayEl = document.createElement('div');
      dayEl.className = 'calview-day';
      dayEl.dataset.day = cell.dayKey;
      if (!cell.isCurrentMonth) dayEl.classList.add('is-out-month');
      if (cell.isToday) dayEl.classList.add('is-today');
      if (cell.dayKey === selectedDate) dayEl.classList.add('is-selected');
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
        selectedDate = cell.dayKey;
        weekAnchor = cell.dayKey;
        calendarMonth = monthOf(cell.dayKey);
        viewMode = 'timeline';
        await refreshAll();
      });
      grid.append(dayEl);
    }
  }
  container.append(weekday, grid);
}

/** 周历 7 列 */
function renderWeekGrid(container) {
  const [y, m, d] = weekAnchor.split('-').map(Number);
  const sunday = new Date(y, m - 1, d); sunday.setDate(sunday.getDate() - sunday.getDay());
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(sunday); dt.setDate(sunday.getDate() + i);
    days.push(toDayKey(dt));
  }
  const today = todayKey();
  const weekEl = document.createElement('div');
  weekEl.className = 'calview-week-grid';
  const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  for (const dayKey of days) {
    const col = document.createElement('div');
    col.className = 'calview-week-col';
    col.dataset.day = dayKey;
    if (dayKey === today) col.classList.add('is-today');
    if (dayKey === selectedDate) col.classList.add('is-selected');
    const head = document.createElement('div');
    head.className = 'calview-week-head';
    const dt = new Date(Number(dayKey.slice(0, 4)), Number(dayKey.slice(5, 7)) - 1, Number(dayKey.slice(8, 10)));
    const cards = getCardsByDaySync(dayKey);
    head.innerHTML = `<span>${weekNames[dt.getDay()]} ${dayKey.slice(5).replace('-', '/')}</span><span class="calview-week-count">${cards.length}</span>`;
    head.addEventListener('click', async () => {
      selectedDate = dayKey;
      weekAnchor = dayKey;
      calendarMonth = monthOf(dayKey);
      viewMode = 'timeline';
      await refreshAll();
    });
    col.append(head);
    const list = document.createElement('div');
    list.className = 'calview-week-cards';
    for (const card of cards) list.append(buildCalSummary(card));
    col.append(list);
    weekEl.append(col);
  }
  container.append(weekEl);
}

/** 卡片摘要（月历/周历共用）：时间 + 类型图标 + 内容截断，点击进编辑器 */
function buildCalSummary(card) {
  const el = document.createElement('div');
  el.className = `calview-summary type-${card.type || 'text'}` + (card.type === 'task' && card.done ? ' is-done' : '');
  const start = getCardStartTime(card);
  const timeHtml = start ? `<span class="calview-summary-time">${start}</span>` : '';
  el.innerHTML = `${timeHtml}<span class="card-type-icon">${typeIcon(card.type)}</span><span class="calview-summary-text">${escapeHtml(card.content || '(空卡片)')}</span>`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    openEditor(card, start ?? currentTime(), card.assignedDate ?? selectedDate);
  });
  return el;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ─── 渲染：时间线 ──────────────────────────────────────── */

async function renderTimeline() {
  const date = selectedDate;
  const dayCards = await getCardsByDay(date);
  const typeCounts = getCardTypeCounts(allCardsCache, date);

  // ── 视图切换：timeline 模式才写入 dateHeader ──
  if (viewMode === 'timeline') {
    // 标题
    const parts = [];
    if (typeCounts.text) parts.push(`${typeCounts.text}📝`);
    if (typeCounts.task) parts.push(`${typeCounts.task}☑️`);
    if (typeCounts.idea) parts.push(`${typeCounts.idea}💡`);
    const countStr = parts.length ? ` · ${parts.join(' ')}` : ' · 无卡片';
    els.timelineDateHeader.textContent = `📅 ${formatDateLabel(date)}${countStr}`;
  }

  // 日程画布（08:00–22:30，15 分钟网格）
  const container = els.timelineContainer;
  container.replaceChildren();

  const timedCards = dayCards.filter(c => getCardStartTime(c));

  // 视图边界：默认 08:00–22:30，timelineSpan='full' 时 00:00–24:00；数据超出时自动扩展
  viewStartMin = timelineSpan === 'full' ? 0 : DAY_START_MIN;
  viewEndMin = timelineSpan === 'full' ? 24 * 60 : DAY_END_MIN;
  for (const c of timedCards) {
    const s = timeToMinutes(getCardStartTime(c));
    const e = timeToMinutes(getCardEndTime(c) ?? addMinutes(getCardStartTime(c), 15));
    viewStartMin = Math.min(viewStartMin, Math.floor(s / 15) * 15);
    viewEndMin = Math.max(viewEndMin, Math.ceil(e / 15) * 15);
  }
  viewStartMin = Math.max(0, viewStartMin);
  viewEndMin = Math.min(24 * 60, viewEndMin);

  const canvas = document.createElement('div');
  canvas.className = 'schedule-canvas';
  canvas.style.height = `${scheduleHeight(viewEndMin)}px`;
  container.append(canvas);

  // 背景网格线（每 15 分钟，整点加粗并显示标签）
  for (let m = viewStartMin; m <= viewEndMin; m += 15) {
    const line = document.createElement('div');
    const isHour = m % 60 === 0;
    line.className = 'schedule-grid-line' + (isHour ? ' is-hour' : '');
    line.style.top = `${scheduleHeight(m)}px`;
    if (isHour) {
      const lbl = document.createElement('span');
      lbl.className = 'schedule-grid-label';
      lbl.textContent = minutesToTime(m);
      line.append(lbl);
    }
    line.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditor(null, snapToQuarter(minutesToTime(m)), date);
    });
    canvas.append(line);
  }

  // 点击画布空白区域：根据 Y 坐标计算时间，打开新建编辑器
  // 卡片/marker 内部冒泡上来的点击直接忽略，否则会覆盖已打开的编辑态
  canvas.addEventListener('click', (e) => {
    if (e.target.closest('.timeline-card, .timeline-now-marker')) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const mins = viewStartMin + (y / SLOT_HEIGHT) * 15;
    const snapped = snapToQuarter(minutesToTime(mins));
    openEditor(null, snapped, date);
  });

  // ── 框选创建时间范围：空白区 mousedown → 拖动 → mouseup ──
  // 拖动后选区代表一个时间段，松手弹编辑器预填起止时间；纯点击保持单格创建
  let sel = null; // { startMin, overlay }
  let suppressCanvasClick = false; // 框选后抑制 canvas 的 click（避免二次创建）
  const removeSel = () => {
    if (sel?.overlay) sel.overlay.remove();
    sel = null;
  };

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // 仅左键
    // 在卡片/marker/网格标签上按下不框选（网格线单击创建走原有逻辑）
    if (e.target.closest('.timeline-card, .timeline-now-marker, .schedule-grid-label, .card-add-btn')) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const startMin = viewStartMin + (y / SLOT_HEIGHT) * 15;
    // 钳制到视图范围内
    const startM = Math.max(viewStartMin, Math.min(viewEndMin, startMin));
    const overlay = document.createElement('div');
    overlay.className = 'selection-overlay';
    overlay.style.top = `${scheduleHeight(Math.floor(startM / 15) * 15)}px`;
    overlay.style.height = '0px';
    canvas.append(overlay);
    sel = { startM, overlay, dragging: false };
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!sel) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const endMin = viewStartMin + (y / SLOT_HEIGHT) * 15;
    const endM = Math.max(viewStartMin, Math.min(viewEndMin, endMin));
    // 拖动超过 3px 才视为框选（否则是单击）
    const delta = endM - sel.startM;
    if (Math.abs(delta) * (SLOT_HEIGHT / 15) < 3) return;
    sel.dragging = true;
    // 选区：起点到终点的 15 分钟网格范围
    const s = Math.min(sel.startM, endM);
    const e2 = Math.max(sel.startM, endM);
    const sSlot = Math.floor(s / 15) * 15;
    const eSlot = Math.ceil(e2 / 15) * 15;
    sel.overlay.style.top = `${scheduleHeight(sSlot)}px`;
    sel.overlay.style.height = `${scheduleHeight(eSlot) - scheduleHeight(sSlot)}px`;
    sel.endM = endM;
  });

  canvas.addEventListener('mouseup', async (e) => {
    if (!sel) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const endMin = viewStartMin + (y / SLOT_HEIGHT) * 15;
    const endM = Math.max(viewStartMin, Math.min(viewEndMin, endMin));
    const { startM, dragging } = sel;
    removeSel();

    if (!dragging) return; // 纯点击 → 走 canvas click（单格创建）
    suppressCanvasClick = true;

    // 起止时间：向上取整/向下取整到 15 分钟，保证最小 15 分钟
    const s = Math.floor(Math.min(startM, endM) / 15) * 15;
    const e2 = Math.max(startM, endM);
    let eSlot = Math.ceil(e2 / 15) * 15;
    if (eSlot - s < 15) eSlot = s + 15;
    eSlot = Math.min(viewEndMin, eSlot);
    if (eSlot - s < 15) s = Math.max(viewStartMin, eSlot - 15);

    const startTime = minutesToTime(s);
    openEditor(null, startTime, date);
    // 编辑器预填结束时间（openEditor 自动算 end = start + 15，需覆盖为选区时长）
    const endEl = document.getElementById('card-editor-end');
    if (endEl) endEl.value = minutesToTime(eSlot);
  });

  // 框选后抑制一次 canvas click（mouseup 已触发编辑器，避免 click 再开一个）
  canvas.addEventListener('click', (e) => {
    if (suppressCanvasClick) { suppressCanvasClick = false; e.stopPropagation(); }
  }, true); // capture：抢在原有 click 之前

  // ── 拖拽来自卡片池的卡片：根据 Y 坐标设置时间槽 ──
  canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    canvas.classList.add('drag-over');
  });
  canvas.addEventListener('dragleave', () => {
    canvas.classList.remove('drag-over');
  });
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    canvas.classList.remove('drag-over');
    const cardId = e.dataTransfer.getData('text/plain');
    if (!cardId) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawMins = viewStartMin + (y / SLOT_HEIGHT) * 15;
    const snapped = snapToQuarter(minutesToTime(Math.max(viewStartMin, Math.min(viewEndMin - 15, rawMins))));
    updateCardEntry(cardId, {
      assignedDate: date,
      time: snapped,
      startTime: snapped,
      endTime: addMinutes(snapped, 15),
    }).then(async () => {
      await refreshAll();
      // 拖拽放置后直接打开编辑器（「拖到单元格进行编辑」）
      const dropped = allCardsCache.find(c => c.id === cardId);
      if (dropped) openEditor(dropped, snapped, date);
    })
      .catch(err => console.error('[journal] drop move failed:', err));
  });

  // 重叠区间 lane 分配
  const laneItems = timedCards.map(c => ({
    id: c.id,
    start: timeToMinutes(getCardStartTime(c)),
    end: timeToMinutes(getCardEndTime(c) ?? addMinutes(getCardStartTime(c), 15)),
  }));
  const lanes = layoutScheduleLanes(laneItems);

  for (const card of timedCards) {
    const laneInfo = lanes.get(card.id);
    const cardEl = renderTimelineCard(card, laneInfo);
    canvas.append(cardEl);

    // 最右侧卡片：hover 时在右侧滑入"同一时间新建"按钮
    // 按钮直接放在 canvas 上（避免 overflow 裁剪），通过 JS 鼠标联动控制显示
    if (laneInfo) {
      const laneCount = Math.max(1, laneInfo.laneCount);
      if (laneInfo.lane >= laneCount - 1) {
        const startMin = timeToMinutes(getCardStartTime(card));
        const endMin = timeToMinutes(getCardEndTime(card) ?? addMinutes(getCardStartTime(card), 15));
        const midMin = (startMin + endMin) / 2;

        const addBtn = document.createElement('button');
        addBtn.className = 'card-add-btn';
        addBtn.title = '在同一时间新建卡片';
        addBtn.textContent = '＋';
        addBtn.style.top = `${scheduleHeight(midMin)}px`;
        addBtn.style.left = `calc(${((laneInfo.lane + 1) / laneCount) * 100}% - 29px)`;
        canvas.append(addBtn);

        const showAdd = () => {
          cardEl.classList.add('is-hover-add');
          addBtn.classList.add('is-visible');
        };
        const hideAdd = () => {
          cardEl.classList.remove('is-hover-add');
          addBtn.classList.remove('is-visible');
        };
        cardEl.addEventListener('mouseenter', showAdd);
        cardEl.addEventListener('mouseleave', hideAdd);
        addBtn.addEventListener('mouseenter', showAdd);
        addBtn.addEventListener('mouseleave', hideAdd);
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openEditor(null, getCardStartTime(card) ?? currentTime(), selectedDate);
        });
      }
    }
  }
  renderCurrentTimeMarker();

  // 无时间的卡片（置底，全天区）
  const noTimeCards = dayCards.filter(c => !getCardStartTime(c));
  if (noTimeCards.length) {
    const all = document.createElement('div');
    all.className = 'schedule-allday';
    const head = document.createElement('div');
    head.className = 'schedule-allday-label';
    head.textContent = '全天';
    all.append(head);
    const wrap = document.createElement('div');
    wrap.className = 'schedule-allday-cards';
    for (const card of noTimeCards) wrap.append(renderTimelineCard(card, null, true));
    all.append(wrap);
    container.append(all);
  }
}

/** 日程画布默认范围（分钟）：08:00–22:30 */
const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 22 * 60 + 30;
/** 当前视图范围（分钟）：默认 08:00–22:30；当天卡片超出时由 renderTimeline 扩展 */
let viewStartMin = DAY_START_MIN;
let viewEndMin = DAY_END_MIN;
/** 15 分钟一格的高度（px） */
const SLOT_HEIGHT = 30;

/** 时间分钟数 → 画布 top 偏移（px，基于当前视图范围） */
function scheduleHeight(mins) {
  return (mins - viewStartMin) / 15 * SLOT_HEIGHT;
}

/**
 * 渲染单张日程卡片（绝对定位在画布上）
 * @param {object} card
 * @param {{lane:number, laneCount:number}|null} lane — null 表示全天卡片
 * @param {boolean} [allday=false]
 */
function renderTimelineCard(card, lane = null, allday = false) {
  const el = document.createElement('div');
  el.className = 'timeline-card' + (allday ? ' is-allday' : '');
  el.dataset.id = card.id;

  if (!allday && lane) {
    const start = getCardStartTime(card);
    const end = getCardEndTime(card) ?? addMinutes(start, 15);
    const dur = Math.max(15, timeToMinutes(end) - timeToMinutes(start));
    // 短卡片（时长 ≤ 30 分钟）紧凑横向布局：单行展示时间+内容前缀；拖拽时保持紧凑
    if (dur <= 30) el.classList.add('is-short');
    const laneCount = Math.max(1, lane.laneCount);
    el.style.top = `${scheduleHeight(timeToMinutes(start))}px`;
    el.style.height = `${(dur / 15) * SLOT_HEIGHT}px`;
    el.style.left = `calc(${(lane.lane / laneCount) * 100}% + 3px)`;
    el.style.setProperty('--lane-w', `calc(${100 / laneCount}% - 6px)`);
    el.style.width = 'var(--lane-w)';
    el.dataset.start = start;
    el.dataset.end = end;
  }

  const isShort = el.classList.contains('is-short');

  // Header（短卡片只显示开始时间，把横向空间让给内容）
  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `
    <span class="card-type-icon">${typeIcon(card.type)}</span>
    <span class="card-time">${allday ? '全天' : isShort ? getCardStartTime(card) : `${getCardStartTime(card)}–${getCardEndTime(card) ?? addMinutes(getCardStartTime(card), 15)}`}</span>
    <span class="card-meta">${!allday && !isShort ? `${Math.max(15, getCardDuration(card))} 分钟` : ''}</span>
  `;

  // Body
  const body = document.createElement('div');
  body.className = 'card-body' + (card.type === 'task' && card.done ? ' is-done' : '');
  body.textContent = card.content || '(空卡片)';

  // Footer
  const footer = buildCardFooter(card);

  // 点击卡片编辑（拖拽后抑制一次；阻止冒泡到 canvas，避免二次打开空编辑器）
  let suppressClick = false;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (suppressClick) { suppressClick = false; return; }
    openEditor(card, getCardStartTime(card) ?? currentTime(), selectedDate);
  });

  // 非全天卡片：底部 resize 手柄调整结束时间
  if (!allday && lane) {
    const handle = document.createElement('div');
    handle.className = 'card-resize-handle';
    handle.title = '拖动调整时长（15 分钟吸附）';
    let dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      e.preventDefault();
      const rect = el.parentElement.getBoundingClientRect();
      const rawMins = viewStartMin + ((e.clientY - rect.top) / SLOT_HEIGHT) * 15;
      let endMin = Math.round(rawMins / 15) * 15;
      const startMin = timeToMinutes(getCardStartTime(card));
      endMin = Math.max(startMin + 15, endMin);
      endMin = Math.min(viewEndMin, endMin);
      const end = minutesToTime(endMin);
      const dur = endMin - startMin;
      el.dataset.end = end;
      el.style.height = `${(dur / 15) * SLOT_HEIGHT}px`;
      const time = el.querySelector('.card-time');
      const isShort = el.classList.contains('is-short');
      if (time) time.textContent = isShort ? getCardStartTime(card) : `${getCardStartTime(card)}–${end}`;
      const meta = el.querySelector('.card-meta');
      if (meta) meta.textContent = isShort ? '' : `${dur} 分钟`;
    };
    const onUp = async (e) => {
      if (!dragging) return;
      dragging = false;
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('is-resizing');
      suppressClick = true;
      const start = getCardStartTime(card);
      // 若 pointerup 未经过 pointermove（如只点了 handle），从当前高度反推结束时间
      let end = el.dataset.end;
      if (!end) {
        const heightPx = el.getBoundingClientRect().height || SLOT_HEIGHT;
        const dur = Math.max(15, Math.round((heightPx / SLOT_HEIGHT) * 15 / 15) * 15);
        end = minutesToTime(timeToMinutes(start) + dur);
      }
      if (start && end) {
        try {
          await updateCardEntry(card.id, { time: start, startTime: start, endTime: end });
          await refreshAll();
        } catch (err) {
          console.error('[journal] resize save failed:', err);
        }
      }
    };
    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      document.body.classList.add('is-resizing');
      handle.setPointerCapture(e.pointerId);
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });
    el.append(handle);
  }

  // 非全天卡片：拖动主体（header/body 区域）纵向移动，改变开始时间、时长不变
  // 15 分钟吸附、钳制到画布范围，拖放后持久化并刷新（lane 自动重排）
  if (!allday && lane) {
    const startMin = timeToMinutes(getCardStartTime(card));
    const endMin = timeToMinutes(getCardEndTime(card) ?? addMinutes(getCardStartTime(card), 15));
    const dur = Math.max(15, endMin - startMin);
    let dragging = false;
    let moved = false;
    let grabOffsetMin = 0;
    let startY = 0;
    const MOVE_THRESHOLD_PX = 4; // 忽略点击时的微小抖动，避免误判为拖动
    const onMove = (e) => {
      if (!dragging) return;
      if (!moved && Math.abs(e.clientY - startY) < MOVE_THRESHOLD_PX) return;
      e.preventDefault();
      moved = true;
      const rect = el.parentElement.getBoundingClientRect();
      const rawMins = viewStartMin + ((e.clientY - rect.top) / SLOT_HEIGHT) * 15 - grabOffsetMin;
      const snappedMin = Math.round(rawMins / 15) * 15;
      // 钳制：开始时间 ∈ [视图上界, 视图下界 - dur]，保证卡片始终在画布内
      const newStartMin = Math.max(viewStartMin, Math.min(viewEndMin - dur, snappedMin));
      const newStart = minutesToTime(newStartMin);
      const newEnd = minutesToTime(newStartMin + dur);
      el.dataset.start = newStart;
      el.dataset.end = newEnd;
      el.style.top = `${scheduleHeight(newStartMin)}px`;
      const time = el.querySelector('.card-time');
      const isShort = el.classList.contains('is-short');
      if (time) time.textContent = isShort ? newStart : `${newStart}–${newEnd}`;
      const meta = el.querySelector('.card-meta');
      if (meta) meta.textContent = isShort ? '' : `${dur} 分钟`;
    };
    const onUp = async () => {
      if (!dragging) return;
      dragging = false;
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('is-dragging');
      el.classList.remove('is-dragging');
      // 仅在真正发生位移时才抑制点击并持久化；纯点击保持编辑功能
      if (!moved) return;
      suppressClick = true;
      const newStart = el.dataset.start;
      const newEnd = el.dataset.end;
      if (newStart && newEnd) {
        try {
          await updateCardEntry(card.id, { time: newStart, startTime: newStart, endTime: newEnd });
          await refreshAll();
        } catch (err) {
          console.error('[journal] card move save failed:', err);
        }
      }
    };
    el.addEventListener('pointerdown', (e) => {
      // 不拦截 footer 按钮与 resize 手柄的交互
      if (e.target.closest('.card-footer, .card-resize-handle')) return;
      dragging = true;
      moved = false;
      startY = e.clientY;
      const grabY = e.clientY - el.getBoundingClientRect().top;
      grabOffsetMin = (grabY / SLOT_HEIGHT) * 15;
      document.body.classList.add('is-dragging');
      el.classList.add('is-dragging');
      el.setPointerCapture(e.pointerId);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    });
  }

  el.append(header, body, footer);
  return el;
}

/** 构建卡片底部操作区（完成/类型/删除） */
function buildCardFooter(card) {
  const footer = document.createElement('div');
  footer.className = 'card-footer';

  if (Array.isArray(card.tags) && card.tags.length) {
    const chips = document.createElement('span');
    chips.className = 'card-tags';
    for (const name of card.tags) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip is-static';
      chip.textContent = name;
      chips.append(chip);
    }
    footer.append(chips);
  }

  if (card.type === 'task') {
    const doneBtn = document.createElement('button');
    doneBtn.className = 'card-footer-btn done-btn';
    doneBtn.textContent = card.done ? '↩️ 撤销' : '✅ 完成';
    doneBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await updateCardEntry(card.id, { done: !card.done });
      await refreshAll();
    });
    footer.append(doneBtn);
  }

  const typeBtn = document.createElement('button');
  typeBtn.className = 'card-footer-btn';
  typeBtn.textContent = '🔄';
  typeBtn.title = '切换类型';
  typeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const next = card.type === 'text' ? 'task' : card.type === 'task' ? 'idea' : 'text';
    await updateCardEntry(card.id, { type: next });
    await refreshAll();
  });
  footer.append(typeBtn);

  const delBtn = document.createElement('button');
  delBtn.className = 'card-footer-btn';
  delBtn.textContent = '🗑️';
  delBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm('删除这张卡片？')) {
      await deleteCardEntry(card.id);
      await refreshAll();
    }
  });
  footer.append(delBtn);
  return footer;
}

/**
 * 今日当前时间刻度 marker：只在今天显示，绝对定位在画布对应 Y 坐标，绿色横线 + 「现在 HH:mm」。
 * 范围外钳制到画布顶部/底部，保证可见。
 */
function renderCurrentTimeMarker() {
  const canvas = els.timelineContainer.querySelector('.schedule-canvas');
  if (!canvas) return;

  // 移除上一次的 marker，避免每次 refreshAll 叠加
  canvas.querySelectorAll('.timeline-now-marker').forEach(el => el.remove());

  // 仅今天显示
  if (selectedDate !== todayKey()) return;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const clamped = Math.max(viewStartMin, Math.min(viewEndMin, nowMin));
  const nowLabel =
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0');

  const marker = document.createElement('div');
  marker.className = 'timeline-now-marker';
  marker.style.top = `${scheduleHeight(clamped)}px`;
  const tag = document.createElement('span');
  tag.className = 'timeline-now-tag';
  tag.textContent = `● 现在 ${nowLabel}`;
  marker.append(tag);
  const line = document.createElement('span');
  line.className = 'timeline-now-line';
  marker.append(line);
  marker.title = '点击在当前时间新建卡片';
  marker.setAttribute('role', 'button');
  marker.tabIndex = 0;
  const createAtNow = () => openEditor(null, snapUpToQuarter(currentTime()), selectedDate);
  marker.addEventListener('click', (e) => {
    e.stopPropagation();
    createAtNow();
  });
  marker.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      createAtNow();
    }
  });
  canvas.append(marker);
}

/** 每分钟更新今日当前时间 marker（不影响已有时间槽/卡片） */
function startNowMarkerTimer() {
  setInterval(() => {
    renderCurrentTimeMarker();
  }, 60 * 1000);
}

/* ─── 渲染：卡片池 ──────────────────────────────────────── */

let poolTagFilter = '';

function renderPoolTagFilters(pool) {
  const names = [...new Set(pool.flatMap(c => c.tags ?? []))];
  if (!names.length && !poolTagFilter) return;
  const bar = document.createElement('li');
  bar.className = 'cardpool-tag-filters';
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'tag-chip' + (poolTagFilter ? '' : ' is-active');
  all.textContent = '全部';
  all.addEventListener('click', (e) => { e.stopPropagation(); poolTagFilter = ''; renderCardPool(); });
  bar.append(all);
  for (const name of names) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-chip' + (poolTagFilter === name ? ' is-active' : '');
    btn.textContent = name;
    btn.addEventListener('click', (e) => { e.stopPropagation(); poolTagFilter = name; renderCardPool(); });
    bar.append(btn);
  }
  els.cardpoolList.append(bar);
}

async function renderCardPool() {
  const allPool = await getPoolCards();
  const pool = poolTagFilter ? allPool.filter(c => (c.tags ?? []).includes(poolTagFilter)) : allPool;
  els.cardpoolCount.textContent = allPool.length;
  els.cardpoolList.replaceChildren();
  renderPoolTagFilters(allPool);

  if (!pool.length) {
    const li = document.createElement('li');
    li.className = 'todo-empty';
    li.textContent = poolTagFilter ? '没有这个标签的卡片' : '没有未安排的卡片';
    els.cardpoolList.append(li);
    return;
  }

  for (const card of pool) {
    const li = document.createElement('li');
    li.className = 'cardpool-item';
    li.dataset.id = card.id;
    // 支持拖拽到今日时间线（HTML5 DnD）
    li.draggable = true;
    let cardDragged = false; // 真拖拽后抑制 click 打开编辑器
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.id);
      e.dataTransfer.effectAllowed = 'move';
      li.classList.add('is-dragging');
      cardDragged = false; // 初始化，dragend 前不会触发 click
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('is-dragging');
      // 标记已发生拖拽，后续 click 不打开编辑器
      cardDragged = true;
      setTimeout(() => { cardDragged = false; }, 0); // 下一帧解除，只跳过一次
    });

    const icon = document.createElement('span');
    icon.className = 'cardpool-type-icon';
    icon.textContent = typeIcon(card.type);

    const text = document.createElement('span');
    text.className = 'cardpool-text';
    text.textContent = card.content || '(空)';

    const schedBtn = document.createElement('button');
    schedBtn.className = 'cardpool-schedule-btn';
    schedBtn.textContent = '📅';
    schedBtn.title = '安排到某天';
    schedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 直接安排到当天
      const st = snapUpToQuarter(currentTime());
      updateCardEntry(card.id, { assignedDate: selectedDate, time: st, startTime: st, endTime: addMinutes(st, 15) })
        .then(() => refreshAll())
        .catch(err => console.error('[journal] schedule card failed:', err));
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'cardpool-delete-btn';
    delBtn.textContent = '🗑️';
    delBtn.title = '删除卡片';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('删除这张卡片？')) {
        deleteCardEntry(card.id)
          .then(() => refreshAll())
          .catch(err => console.error('[journal] delete card failed:', err));
      }
    });

    // 点击编辑（拖拽后抑制一次，避免 drop 后误触）
    li.addEventListener('click', () => { if (!cardDragged) openEditor(card, currentTime(), selectedDate); });

    li.append(icon, text, schedBtn, delBtn);
    els.cardpoolList.append(li);
  }
}

/* ─── 渲染：热力图 ──────────────────────────────────────── */

function renderHeatmap(container, heatmap) {
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

/* ─── 渲染：日历 ──────────────────────────────────────── */

function renderCalendar(container, matrix, selectedDate, heatmap) {
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
      if (cell.dayKey === selectedDate) btn.classList.add('is-selected');
      // 卡片数量背景色
      const bgLevel = count >= 5 ? 5 : count;
      if (bgLevel > 0) btn.classList.add(`count-${bgLevel}`);

      container.append(btn);
    }
  }
}

function renderCalendarView() {
  const matrix = getMonthMatrix(calendarMonth.year, calendarMonth.month);
  if (els.calMonthLabel) {
    els.calMonthLabel.textContent = `${calendarMonth.year}年${calendarMonth.month + 1}月`;
  }
  renderCalendar(els.calendarGrid, matrix, selectedDate, heatmapCache);
}

function updateHeaderDate() {
  if (els.todayDisplay) {
    els.todayDisplay.textContent = formatDateLabel(selectedDate);
  }
}

/* ─── 渲染：TODO ──────────────────────────────────────── */

function renderTodoList() {
  const filtered = todosCache.filter(t =>
    todoFilter === 'active' ? !t.done : todoFilter === 'done' ? t.done : true
  );

  els.todoList.replaceChildren();
  if (!filtered.length) {
    const li = document.createElement('li');
    li.className = 'todo-empty';
    li.textContent = todoFilter === 'done' ? '还没有已完成的待办' : '暂无待办';
    els.todoList.append(li);
    return;
  }

  for (const t of filtered) {
    const li = document.createElement('li');
    li.className = 'todo-item' + (t.done ? ' is-done' : '');
    li.dataset.id = t.id;

    const dot = document.createElement('span');
    dot.className = `todo-priority-dot ${t.priority}`;

    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'todo-check'; cb.checked = t.done;

    const title = document.createElement('span');
    title.className = 'todo-title';
    title.textContent = t.title;

    li.append(dot, cb, title);

    if (t.due) {
      const dueEl = document.createElement('span');
      dueEl.className = 'todo-due' + (isOverdue(t.due) && !t.done ? ' is-overdue' : '');
      dueEl.textContent = t.due;
      li.append(dueEl);
    }

    const del = document.createElement('button');
    del.className = 'todo-delete';
    del.textContent = '✕';
    li.append(del);

    els.todoList.append(li);
  }

  const s = todoSummary(todosCache);
  els.todoStats.textContent = `${s.done}/${s.total}`;
}

async function persistTodos() {
  await saveTodos(todosCache);
  renderTodoList();
}

/* ─── 全局刷新 ────────────────────────────────────────── */

async function refreshAll() {
  allCardsCache = await getAllCards();
  heatmapCache = countCardsByDay(allCardsCache);
  renderHeatmap(els.heatmap, heatmapCache);
  renderCalendarView();
  await renderRightView();
  await renderCardPool();
  // 刷新 TODO（从 cards 中筛选 task）
  todosCache = await getTodos();
  renderTodoList();
}

/* ─── 本机 Skills ────────────────────────────────────── */

let skillsCache = null;

async function loadSkillStatus() {
  try {
    const res = await fetch('http://127.0.0.1:8765/api/skill-status');
    const data = await res.json();
    skillsCache = data?.data ?? null;
  } catch (e) {
    skillsCache = null;
  }
  renderSkillStatus();
}

function renderSkillStatus() {
  const s = skillsCache;
  els.skillsList.replaceChildren();

  if (!s) {
    els.skillsCount.textContent = '—';
    els.skillsOverall.textContent = '⚠️ host 未连接，无法检测';
    return;
  }

  els.skillsCount.textContent = s.installed ? '✅' : '❌';
  els.skillsOverall.textContent = s.installed
    ? `journal skill：✅ 已安装（${s.installedCount}/${s.total}）`
    : `journal skill：❌ 未安装（${s.installedCount}/${s.total}）`;

  for (const loc of s.locations) {
    const li = document.createElement('li');
    li.className = 'skills-item';

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;gap:5px;';
    const dot = document.createElement('span');
    dot.textContent = loc.installed ? '✅' : '❌';
    const name = document.createElement('span');
    name.className = 'skills-item-name';
    name.style.flex = '';
    name.textContent = loc.platform;
    top.append(dot, name);
    info.append(top);

    const path = document.createElement('div');
    path.className = 'skills-item-desc';
    path.textContent = loc.path;
    path.title = loc.path;
    info.append(path);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'skills-copy-btn';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(loc.path);
        showToast(`✅ 已复制 ${loc.platform} 路径`, 'success');
      } catch (e) {
        showToast('复制失败，请手动复制', 'error');
      }
    });

    li.append(info, copyBtn);
    els.skillsList.append(li);
  }
}

/* ─── 初始化 ────────────────────────────────────────── */

async function init() {
  // 主题
  const settings = await getSettings();
  if (settings.theme === 'dark' ||
      (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.dataset.theme = 'dark';
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
  await refreshAll();

  // ── 右视图导航 / 模式切换 ──
  els.viewPrev.addEventListener('click', async () => {
    if (viewMode === 'month') {
      let { year, month } = calendarMonth;
      month -= 1;
      if (month < 0) { month = 11; year -= 1; }
      calendarMonth = { year, month };
      renderCalendarView();
    } else if (viewMode === 'week') {
      weekAnchor = addDays(weekAnchor, -7);
    } else {
      selectedDate = addDays(selectedDate, -1);
      weekAnchor = selectedDate;
      calendarMonth = monthOf(selectedDate);
      updateHeaderDate();
      renderCalendarView();
    }
    await renderRightView();
  });

  els.viewNext.addEventListener('click', async () => {
    if (viewMode === 'month') {
      let { year, month } = calendarMonth;
      month += 1;
      if (month > 11) { month = 0; year += 1; }
      calendarMonth = { year, month };
      renderCalendarView();
    } else if (viewMode === 'week') {
      weekAnchor = addDays(weekAnchor, 7);
    } else {
      selectedDate = addDays(selectedDate, 1);
      weekAnchor = selectedDate;
      calendarMonth = monthOf(selectedDate);
      updateHeaderDate();
      renderCalendarView();
    }
    await renderRightView();
  });

  els.viewToday.addEventListener('click', async () => {
    calendarMonth = monthOf(todayKey());
    weekAnchor = todayKey();
    selectedDate = todayKey();
    updateHeaderDate();
    renderCalendarView();
    await renderRightView();
  });

  els.viewModeBtns?.forEach(btn => {
    btn.addEventListener('click', async () => {
      viewMode = btn.dataset.mode;
      localStorage.setItem('journal.viewMode', viewMode);
      markViewMode();
      await renderRightView();
    });
  });

  // 24h / 08-22 时间线范围切换
  const updateSpanBtn = () => {
    if (els.btnSpan) els.btnSpan.textContent = timelineSpan === 'full' ? '24h' : '08–22';
  };
  updateSpanBtn();
  els.btnSpan?.addEventListener('click', async () => {
    timelineSpan = timelineSpan === 'full' ? 'default' : 'full';
    localStorage.setItem('journal.timelineSpan', timelineSpan);
    updateSpanBtn();
    if (viewMode === 'timeline') await renderRightView();
  });

  // 今日当前时间 marker 每分钟更新
  startNowMarkerTimer();

  // ── 编辑器事件 ──
  editorSave.addEventListener('click', saveEditor);
  editorCancel.addEventListener('click', closeEditor);
  editorClose.addEventListener('click', closeEditor);
  editorStart?.addEventListener('change', updateEditorDuration);
  editorEnd?.addEventListener('change', updateEditorDuration);
  editorOverlay.addEventListener('click', (e) => {
    if (e.target === editorOverlay) saveEditor();
  });

  // ── 卡片池新建 ──
  els.btnNewCard.addEventListener('click', () => {
    // 直接开空白编辑器，保存时才落库（assignedDate = null → 未安排），取消不产生空卡片
    openEditor(null, currentTime(), null, null);
  });

  // ── 日历月份导航（左侧小日历）──
  els.calPrev.addEventListener('click', () => {
    let { year, month } = calendarMonth;
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
    calendarMonth = { year, month };
    renderCalendarView();
    if (viewMode === 'month') renderRightView();
  });

  els.calNext.addEventListener('click', () => {
    let { year, month } = calendarMonth;
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    calendarMonth = { year, month };
    renderCalendarView();
    if (viewMode === 'month') renderRightView();
  });

  els.calToday.addEventListener('click', async () => {
    calendarMonth = monthOf(todayKey());
    selectedDate = todayKey();
    weekAnchor = todayKey();
    updateHeaderDate();
    renderCalendarView();
    await renderRightView();
  });

  // ── 日历点击切换日期 ──
  els.calendarGrid.addEventListener('click', async (e) => {
    const cell = e.target.closest('.cal-day');
    if (!cell || !cell.dataset.day) return;
    selectedDate = cell.dataset.day;
    weekAnchor = cell.dataset.day;
    updateHeaderDate();
    renderCalendarView();
    await renderRightView();
  });

  // ── 热力图点击切换日期 ──
  els.heatmap.addEventListener('click', (e) => {
    const cell = e.target.closest('.heatmap-cell');
    if (!cell || !cell.dataset.day) return;
    selectedDate = cell.dataset.day;
    weekAnchor = cell.dataset.day;
    // 跳到对应月份
    calendarMonth = monthOf(cell.dataset.day);
    updateHeaderDate();
    renderCalendarView();
    renderRightView();
  });

  // ── TODO：添加 ──
  els.todoInput.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !els.todoInput.value.trim()) return;
    const title = els.todoInput.value.trim();
    await createCardEntry({
      content: title,
      type: 'task',
      assignedDate: els.todoDue.value || null,
      priority: els.todoPriority?.value || 'medium',
    });
    els.todoInput.value = '';
    els.todoDue.value = '';
    await refreshAll();
  });

  // ── TODO：事件委托 ──
  els.todoList.addEventListener('click', async (e) => {
    const item = e.target.closest('.todo-item');
    if (!item) return;
    const id = item.dataset.id;

    if (e.target.classList.contains('todo-check')) {
      await updateCardEntry(id, { done: e.target.checked });
    } else if (e.target.classList.contains('todo-delete')) {
      if (confirm('删除待办？')) await deleteCardEntry(id);
    } else {
      return;
    }
    await refreshAll();
  });

  // ── TODO：筛选 ──
  els.todoFilters.forEach(btn => {
    btn.addEventListener('click', () => {
      els.todoFilters.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      todoFilter = btn.dataset.filter;
      renderTodoList();
    });
  });

  // ── 设置按钮 ──
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  els.btnStartHost?.addEventListener('click', startHost);

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

init().catch(err => console.error('[journal] init failed:', err));
