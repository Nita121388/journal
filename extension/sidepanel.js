/**
 * sidepanel.js — 主界面胶水层（卡片时间线版）
 * 职责：DOM 事件绑定 → 调用 lib/store.js → 渲染
 * 规则：不直接碰 chrome.storage.*（走 lib/store.js），不 mix storage + render
 */

import {
  todayKey, currentTime, aggregateHeatmap,
  countCardsByDay, groupCardsForTimeline, getCardTypeCounts,
  todoSummary, dateRange, getMonthMatrix,
} from './lib/model.js';
import {
  getAllCards, getCardsByDay, getPoolCards, getHeatmapData,
  createCardEntry, updateCardEntry, deleteCardEntry,
  getTodos, saveTodos, getSettings,
} from './lib/store.js';
import { pullFromHost, startPushListener } from './lib/host-sync.js';

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
const editorSave = document.getElementById('card-editor-save');
const editorCancel = document.getElementById('card-editor-cancel');
const editorClose = document.getElementById('card-editor-close');

/** 正在编辑的卡片 ID（null = 新建模式） */
let editingCardId = null;
/** 编辑器打开时的目标时间 */
let editorTargetTime = null;

/**
 * 打开卡片编辑器
 * @param {object|null} card — null = 新建，否则编辑
 * @param {string} time — HH:MM
 * @param {string|null} date — YYYY-MM-DD
 */
function openEditor(card, time, date) {
  editingCardId = card?.id ?? null;
  editorTargetTime = time;
  editorTime.textContent = `${date ?? selectedDate} ${time}`;
  editorType.value = card?.type ?? 'text';
  editorContent.value = card?.content ?? '';
  editorOverlay.classList.remove('hidden');
  editorContent.focus();
}

function closeEditor() {
  editorOverlay.classList.add('hidden');
  editingCardId = null;
  editorContent.value = '';
}

async function saveEditor() {
  const content = editorContent.value.trim();
  const type = editorType.value;
  if (!content && !editingCardId) { closeEditor(); return; }

  try {
    if (editingCardId) {
      await updateCardEntry(editingCardId, { content, type });
    } else {
      await createCardEntry({
        content,
        type,
        assignedDate: selectedDate,
        time: editorTargetTime,
      });
    }
    closeEditor();
    await refreshAll();
  } catch (e) {
    console.error('[journal] save card failed:', e);
  }
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
  btnAddCard: document.getElementById('btn-add-card'),
  cardpoolList: document.getElementById('cardpool-list'),
  cardpoolCount: document.getElementById('cardpool-count'),
  btnNewCard: document.getElementById('btn-new-card'),
};

/* ─── 渲染：时间线 ──────────────────────────────────────── */

async function renderTimeline() {
  const date = selectedDate;
  const dayCards = await getCardsByDay(date);
  const groups = groupCardsForTimeline(dayCards);
  const typeCounts = getCardTypeCounts(allCardsCache, date);

  // 标题
  const parts = [];
  if (typeCounts.text) parts.push(`${typeCounts.text}📝`);
  if (typeCounts.task) parts.push(`${typeCounts.task}☑️`);
  if (typeCounts.idea) parts.push(`${typeCounts.idea}💡`);
  const countStr = parts.length ? ` · ${parts.join(' ')}` : ' · 无卡片';
  els.timelineDateHeader.textContent = `📅 ${formatDateLabel(date)}${countStr}`;

  // 构建时间刻度（8:00 - 22:00）
  const container = els.timelineContainer;
  container.replaceChildren();

  if (dayCards.length === 0 && groups.length === 0) {
    // 空状态
    const empty = document.createElement('div');
    empty.className = 'timeline-empty';
    empty.innerHTML = `
      <div class="timeline-empty-icon">📝</div>
      <div class="timeline-empty-text">今天还没有记录</div>
      <div style="font-size:12px;color:var(--color-muted);">点击下方按钮或空时间点创建卡片</div>
    `;
    container.append(empty);
    return;
  }

  // 全时间刻度 8:00-22:00
  for (let h = 8; h <= 22; h++) {
    const timeKey = String(h).padStart(2, '0') + ':00';
    const timeKey30 = String(h).padStart(2, '0') + ':30';

    // 上半段 :00
    renderSlot(container, timeKey, findGroupForTime(groups, timeKey));
    // 下半段 :30
    renderSlot(container, timeKey30, findGroupForTime(groups, timeKey30));
  }

  // 无时间的卡片（置底）
  const noTimeGroup = groups.find(g => g.time === null);
  if (noTimeGroup) {
    renderSlot(container, null, noTimeGroup);
  }
}

/**
 * 渲染一个时间刻度槽位
 */
function renderSlot(container, time, group) {
  const slot = document.createElement('div');
  slot.className = 'timeline-slot';

  // 时间标签
  const label = document.createElement('div');
  label.className = 'timeline-time-label';
  label.textContent = time ?? '全天';
  slot.append(label);

  // 轴线 + 圆点
  const axis = document.createElement('div');
  axis.className = 'timeline-axis';

  const dot = document.createElement('div');
  dot.className = 'timeline-dot' + (group ? ' has-cards' : ' is-empty');
  dot.dataset.time = time ?? '';
  if (!group) {
    dot.addEventListener('click', () => openEditor(null, time ?? currentTime(), selectedDate));
  }
  axis.append(dot);

  const connector = document.createElement('div');
  connector.className = 'timeline-connector';
  axis.append(connector);

  slot.append(axis);

  // 卡片区域
  if (group && group.cards.length) {
    const cardsWrap = document.createElement('div');
    cardsWrap.className = 'timeline-cards';
    for (const card of group.cards) {
      cardsWrap.append(renderTimelineCard(card));
    }
    slot.append(cardsWrap);
  }

  container.append(slot);
}

/**
 * 渲染单张时间线卡片
 */
function renderTimelineCard(card) {
  const el = document.createElement('div');
  el.className = 'timeline-card';
  el.dataset.id = card.id;

  // Header
  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `
    <span class="card-type-icon">${typeIcon(card.type)}</span>
    <span class="card-time">${card.time ?? '全天'}</span>
    <span class="card-meta">${wordCount(card.content)} 字</span>
  `;

  // Body
  const body = document.createElement('div');
  body.className = 'card-body' + (card.type === 'task' && card.done ? ' is-done' : '');
  body.textContent = card.content || '(空卡片)';

  // Footer
  const footer = document.createElement('div');
  footer.className = 'card-footer';

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

  // 点击卡片编辑
  el.addEventListener('click', () => openEditor(card, card.time ?? currentTime(), selectedDate));

  el.append(header, body, footer);
  return el;
}

/**
 * 查找某个时间点对应的分组（5分钟窗口匹配）
 */
function findGroupForTime(groups, time) {
  const targetMin = timeToMin(time);
  for (const g of groups) {
    if (!g.time) continue;
    if (Math.abs(timeToMin(g.time) - targetMin) <= 2) return g;
  }
  return null;
}

function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/* ─── 渲染：卡片池 ──────────────────────────────────────── */

async function renderCardPool() {
  const pool = await getPoolCards();
  els.cardpoolCount.textContent = pool.length;
  els.cardpoolList.replaceChildren();

  if (!pool.length) {
    const li = document.createElement('li');
    li.className = 'todo-empty';
    li.textContent = '没有未安排的卡片';
    els.cardpoolList.append(li);
    return;
  }

  for (const card of pool) {
    const li = document.createElement('li');
    li.className = 'cardpool-item';
    li.dataset.id = card.id;

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
      updateCardEntry(card.id, { assignedDate: selectedDate, time: currentTime() })
        .then(() => refreshAll())
        .catch(err => console.error('[journal] schedule card failed:', err));
    });

    // 点击编辑
    li.addEventListener('click', () => openEditor(card, currentTime(), selectedDate));

    li.append(icon, text, schedBtn);
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

/* ─── 初始化 ────────────────────────────────────────── */

async function init() {
  // 主题
  const settings = await getSettings();
  if (settings.theme === 'dark' ||
      (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.dataset.theme = 'dark';
  }

  // 拉取 host 数据
  await pullFromHost();
  startPushListener();

  // 首次全量渲染
  updateHeaderDate();
  await refreshAll();

  // ── 编辑器事件 ──
  editorSave.addEventListener('click', saveEditor);
  editorCancel.addEventListener('click', closeEditor);
  editorClose.addEventListener('click', closeEditor);
  editorOverlay.addEventListener('click', (e) => {
    if (e.target === editorOverlay) saveEditor();
  });

  // ── 新建卡片按钮 ──
  els.btnAddCard.addEventListener('click', () => {
    openEditor(null, currentTime(), selectedDate);
  });

  // ── 卡片池新建 ──
  els.btnNewCard.addEventListener('click', async () => {
    await createCardEntry({ content: '', type: 'text' });
    const pool = await getPoolCards();
    if (pool.length) openEditor(pool[0], currentTime(), null);
    await refreshAll();
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

  // ── 外部存储变更刷新 ──
  subscribeJournals(() => { refreshAll(); });
}

init().catch(err => console.error('[journal] init failed:', err));
