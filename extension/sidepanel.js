/**
 * sidepanel.js — 主界面胶水层（卡片时间线版）
 * 职责：DOM 事件绑定 → 调用 lib/store.js → 渲染
 * 规则：不直接碰 chrome.storage.*（走 lib/store.js），不 mix storage + render
 */

import {
  todayKey, currentTime, aggregateHeatmap,
  countCardsByDay, groupCardsForTimeline, getCardTypeCounts,
  todoSummary, dateRange, getMonthMatrix,
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
    if (editingCardId) {
      await updateCardEntry(editingCardId, { content, type, time: start, startTime: start, endTime: end, tags: editorTags });
    } else {
      await createCardEntry({
        content,
        type,
        assignedDate: editorAssignDate === undefined ? selectedDate : editorAssignDate,
        time: start,
        startTime: start,
        endTime: end,
        tags: editorTags,
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

/* ─── 渲染：时间线 ──────────────────────────────────────── */

async function renderTimeline() {
  const date = selectedDate;
  const dayCards = await getCardsByDay(date);
  const typeCounts = getCardTypeCounts(allCardsCache, date);

  // 标题
  const parts = [];
  if (typeCounts.text) parts.push(`${typeCounts.text}📝`);
  if (typeCounts.task) parts.push(`${typeCounts.task}☑️`);
  if (typeCounts.idea) parts.push(`${typeCounts.idea}💡`);
  const countStr = parts.length ? ` · ${parts.join(' ')}` : ' · 无卡片';
  els.timelineDateHeader.textContent = `📅 ${formatDateLabel(date)}${countStr}`;

  // 日程画布（08:00–22:30，15 分钟网格）
  const container = els.timelineContainer;
  container.replaceChildren();

  const timedCards = dayCards.filter(c => getCardStartTime(c));

  // 视图边界：默认 08:00–22:30，数据超出时自动扩展，避免卡片被 canvas overflow 裁掉
  viewStartMin = DAY_START_MIN;
  viewEndMin = DAY_END_MIN;
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
    // 短卡片（时长 ≤ 30 分钟）启用紧凑布局 + 悬停展开；拖拽时保持紧凑，避免拖动中涨高
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

  // Header
  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `
    <span class="card-type-icon">${typeIcon(card.type)}</span>
    <span class="card-time">${allday ? '全天' : `${getCardStartTime(card)}–${getCardEndTime(card) ?? addMinutes(getCardStartTime(card), 15)}`}</span>
    <span class="card-meta">${allday ? '' : `${Math.max(15, getCardDuration(card))} 分钟`}</span>
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
      el.dataset.end = end;
      el.style.height = `${((endMin - startMin) / 15) * SLOT_HEIGHT}px`;
      const time = el.querySelector('.card-time');
      if (time) time.textContent = `${getCardStartTime(card)}–${end}`;
      const meta = el.querySelector('.card-meta');
      if (meta) meta.textContent = `${endMin - startMin} 分钟`;
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
      if (time) time.textContent = `${newStart}–${newEnd}`;
      const meta = el.querySelector('.card-meta');
      if (meta) meta.textContent = `${dur} 分钟`;
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
  await renderTimeline();
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
  await refreshAll();

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

  // ── 日历月份导航 ──
  els.calPrev.addEventListener('click', () => {
    let { year, month } = calendarMonth;
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
    calendarMonth = { year, month };
    renderCalendarView();
  });

  els.calNext.addEventListener('click', () => {
    let { year, month } = calendarMonth;
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    calendarMonth = { year, month };
    renderCalendarView();
  });

  els.calToday.addEventListener('click', async () => {
    calendarMonth = monthOf(todayKey());
    selectedDate = todayKey();
    updateHeaderDate();
    renderCalendarView();
    await renderTimeline();
  });

  // ── 日历点击切换日期 ──
  els.calendarGrid.addEventListener('click', async (e) => {
    const cell = e.target.closest('.cal-day');
    if (!cell || !cell.dataset.day) return;
    selectedDate = cell.dataset.day;
    updateHeaderDate();
    renderCalendarView();
    await renderTimeline();
  });

  // ── 热力图点击切换日期 ──
  els.heatmap.addEventListener('click', (e) => {
    const cell = e.target.closest('.heatmap-cell');
    if (!cell || !cell.dataset.day) return;
    selectedDate = cell.dataset.day;
    // 跳到对应月份
    calendarMonth = monthOf(cell.dataset.day);
    updateHeaderDate();
    renderCalendarView();
    renderTimeline();
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
