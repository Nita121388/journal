/**
 * sidepanel.js — 侧边栏主界面胶水层
 * 职责：DOM 事件绑定 → 调用 lib/store.js → 渲染
 * 规则：不直接碰 chrome.storage.*（走 lib/store.js），不 mix storage + render
 */

import { todayKey, aggregateHeatmap, todoSummary, dateRange, getMonthMatrix } from './lib/model.js';
import {
  getJournal, saveJournal,
  getJournalsForHeatmap, subscribeJournals,
  getTodos, saveTodos,
  getSettings,
} from './lib/store.js';
import { pullFromHost, startPushListener } from './lib/host-sync.js';

/* ─── 工具函数 ──────────────────────────────────────── */

/**
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function & {cancel: () => void}}
 */
function debounce(fn, ms = 500) {
  let timer = null;
  const wrapped = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  wrapped.cancel = () => { clearTimeout(timer); timer = null; };
  return wrapped;
}

/** @returns {string} */
function genId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

/** @param {string|null} due @returns {boolean} */
function isOverdue(due) { return due != null && due < todayKey(); }

/**
 * 由 dayKey 解析所在年月（month 为 0-indexed）
 * @param {string} dayKey — "YYYY-MM-DD"
 * @returns {{year:number, month:number}}
 */
function monthOf(dayKey) {
  const [year, month] = dayKey.split('-').map(Number);
  return { year, month: month - 1 };
}

/**
 * 将 dayKey 格式化为中文长日期
 * @param {string} dayKey — "YYYY-MM-DD"
 * @returns {string}
 */
function formatDateLabel(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
}

/* ─── 状态 ──────────────────────────────────────────── */

/** @type {string} 当前编辑日期（textarea/header 的目标日期） */
let selectedDate = todayKey();

/** @type {{year:number, month:number}} 日历当前展示月份（month 0-indexed），默认 todayKey 所在月 */
let calendarMonth = monthOf(todayKey());

/** @type {ReturnType<typeof debounce>|null} 日志保存防抖（init 后赋值，需可 cancel） */
let debouncedSave = null;

/** @type {number} 日期切换序列号，防止并发切换导致 textarea 被过期加载覆盖 */
let switchSeq = 0;

/** @type {Record<string, number>} 热力图聚合缓存（heatmap + 日历填充标记共用） */
let heatmapCache = {};

/* ─── 渲染 ────────────────────────────────────────────── */

/** @param {HTMLElement} container @param {Record<string, number>} heatmap */
function renderHeatmap(container, heatmap) {
  container.replaceChildren();
  const today = todayKey();
  for (const day of dateRange(365)) {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.dataset.day = day;
    const count = heatmap[day] ?? 0;
    cell.title = count > 0 ? day : `${day}（未记录）`;
    if (count > 0) { cell.classList.add('is-filled'); if (day === today) cell.classList.add('is-today'); }
  }
}

/**
 * 渲染日历网格（纯函数：不读 storage、无副作用，由调用方传入全部状态）
 * 使用事件委托：监听方为 container，点击子元素通过 closest('.cal-day') 定位
 * @param {HTMLElement} container
 * @param {Array<Array<{dayKey:string, day:number, isCurrentMonth:boolean, isToday:boolean}>>} matrix
 * @param {string} selectedDate — 当前选中日期 dayKey
 * @param {Record<string, number>} heatmap — dayKey → 条目数（决定 is-filled）
 */
function renderCalendar(container, matrix, selectedDate, heatmap) {
  container.replaceChildren();
  for (const week of matrix) {
    for (const cell of week) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-day';
      btn.dataset.day = cell.dayKey;
      btn.textContent = String(cell.day);
      btn.setAttribute('aria-label',
        `${cell.dayKey}${cell.isCurrentMonth ? '' : '（非本月）'}${cell.isToday ? '，今天' : ''}`
      );
      if (!cell.isCurrentMonth) btn.classList.add('is-out-month');
      if (cell.isToday) btn.classList.add('is-today');
      if (cell.dayKey === selectedDate) btn.classList.add('is-selected');
      if ((heatmap[cell.dayKey] ?? 0) > 0) btn.classList.add('is-filled');
      container.append(btn);
    }
  }
}

/** 渲染当前月份的日历（读 heatmapCache，不直接读 storage） */
function renderCalendarView() {
  const matrix = getMonthMatrix(calendarMonth.year, calendarMonth.month);
  if (els.calMonthLabel) {
    els.calMonthLabel.textContent = `${calendarMonth.year}年${calendarMonth.month + 1}月`;
  }
  renderCalendar(els.calendarGrid, matrix, selectedDate, heatmapCache);
}

/** 更新 header 中的日期显示（同步，不读 storage） */
function updateHeaderDate() {
  if (els.todayDisplay) {
    els.todayDisplay.textContent = formatDateLabel(selectedDate);
  }
}

/** 将 selectedDate 内容加载到 textarea + 更新 header（async；仅初始渲染用） */
async function renderSelectedDate() {
  updateHeaderDate();
  els.textarea.value = await getJournal(selectedDate);
}

/**
 * 刷新热力图 + 日历视图（journals 相关视图的统一刷新入口）
 * @returns {Promise<void>}
 */
async function refreshJournalViews() {
  heatmapCache = aggregateHeatmap(await getJournalsForHeatmap());
  renderHeatmap(els.heatmap, heatmapCache);
  renderCalendarView();
}

/** @param {HTMLElement} statusEl @param {string} text */
function showSaveStatus(statusEl, text) {
  statusEl.textContent = text;
  statusEl.classList.add('visible');
  setTimeout(() => { statusEl.classList.remove('visible'); statusEl.textContent = ''; }, 1500);
}

/* ─── 日期切换 ────────────────────────────────────────── */

/**
 * 取消 pending 防抖保存，立即把当前 textarea 内容写入当前 selectedDate（切换日期前调用）
 * @returns {Promise<void>}
 */
async function flushSave() {
  if (debouncedSave) debouncedSave.cancel();
  const day = selectedDate; // 捕获当前日期，防止 await 期间被切换
  const text = els.textarea.value;
  if (!text) return;
  await saveJournal(day, text);
  showSaveStatus(els.status, '已保存 ✓');
  await refreshJournalViews();
}

/**
 * 切换编辑日期：先 flush 当前草稿 → 预加载新日期内容 → 提交 selectedDate → 重渲染
 * 竞态策略：先加载再提交，期间 selectedDate 不变，flushSave 始终写入内容与日期一致的旧日期；
 * 用 switchSeq 保证只有最后一次切换能提交，避免过期加载覆盖 textarea。
 * @param {string} newDate — 目标日期 dayKey
 * @returns {Promise<void>}
 */
async function switchToDate(newDate) {
  if (!newDate || newDate === selectedDate) return;
  const seq = ++switchSeq;
  await flushSave();
  if (seq !== switchSeq) return;
  const text = await getJournal(newDate);
  if (seq !== switchSeq) return;
  selectedDate = newDate;
  els.textarea.value = text;
  updateHeaderDate();
  renderCalendarView();
}

/** @param {number} delta — +1 下一月，-1 上一月 */
function changeMonth(delta) {
  let { year, month } = calendarMonth;
  month += delta;
  if (month < 0) { month = 11; year -= 1; }
  else if (month > 11) { month = 0; year += 1; }
  calendarMonth = { year, month };
  renderCalendarView();
}

/** 导航回当前月份（与 todayKey 一致） */
function goToTodayMonth() {
  calendarMonth = monthOf(todayKey());
  renderCalendarView();
}

/* ─── TODO 状态 ────────────────────────────────────────── */

/** @type {'active'|'all'|'done'} */
let todoFilter = 'active';
/** @type {Array<{id:string,title:string,done:boolean,due:string|null,priority:string}>} */
let todosCache = [];

/** 根据当前筛选渲染 TODO 列表 + 统计 */
function renderTodoList() {
  const filtered = todosCache.filter(t =>
    todoFilter === 'active' ? !t.done : todoFilter === 'done' ? t.done : true
  );

  els.todoList.replaceChildren();
  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'todo-empty';
    li.textContent = todoFilter === 'done' ? '还没有已完成的待办' : '暂无待办，添加一个吧';
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
    cb.setAttribute('aria-label', `标记完成：${t.title}`);

    const title = document.createElement('span');
    title.className = 'todo-title';
    title.textContent = t.title;

    li.append(dot, cb, title);

    if (t.due) {
      const dueEl = document.createElement('span');
      dueEl.className = 'todo-due' + (isOverdue(t.due) && !t.done ? ' is-overdue' : '');
      dueEl.textContent = `📅 ${t.due}`;
      li.append(dueEl);
    }

    const del = document.createElement('button');
    del.className = 'todo-delete';
    del.textContent = '✕';
    del.setAttribute('aria-label', `删除：${t.title}`);
    li.append(del);

    els.todoList.append(li);
  }

  const s = todoSummary(todosCache);
  els.todoStats.textContent = `${s.done}/${s.total} 已完成`;
}

/** 持久化 todosCache 并重渲染 @returns {Promise<void>} */
async function persistTodos() { await saveTodos(todosCache); renderTodoList(); }

/* ─── DOM 引用 ────────────────────────────────────────── */

const els = {
  todayDisplay: document.getElementById('today-display'),
  textarea: document.getElementById('journal-input'),
  status: document.getElementById('save-status'),
  heatmap: document.getElementById('heatmap-container'),
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
};

/* ─── 初始化 ────────────────────────────────────────── */

async function renderAll() {
  await renderSelectedDate();
  await refreshJournalViews();
}

async function init() {
  // 主题
  const settings = await getSettings();
  if (settings.theme === 'dark' ||
      (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.dataset.theme = 'dark';
  }

  // 从 host 拉取远程数据（若 host 在线且远程数据更多）
  await pullFromHost();

  // 启动推送监听：扩展变更 → debounce 500ms → 同步到 host
  startPushListener();

  await renderAll();

  // ── 日志保存（debounce，写入 selectedDate 而非固定 todayKey） ──
  debouncedSave = debounce(async () => {
    await saveJournal(selectedDate, els.textarea.value);
    showSaveStatus(els.status, '已保存 ✓');
    await refreshJournalViews();
  });
  els.textarea.addEventListener('input', debouncedSave);

  // 外部存储变更刷新热力图 + 日历
  subscribeJournals(journals => {
    heatmapCache = aggregateHeatmap(journals);
    renderHeatmap(els.heatmap, heatmapCache);
    renderCalendarView();
  });

  // ── 日历：月份导航 ──
  els.calPrev.addEventListener('click', () => changeMonth(-1));
  els.calNext.addEventListener('click', () => changeMonth(1));
  els.calToday.addEventListener('click', () => {
    goToTodayMonth();
    switchToDate(todayKey()).catch(err => console.error('[journal] switch to today failed:', err));
  });

  // ── 日历：事件委托（点击某天切换编辑日期） ──
  els.calendarGrid.addEventListener('click', e => {
    const cell = e.target.closest('.cal-day');
    if (!cell || !cell.dataset.day) return;
    switchToDate(cell.dataset.day).catch(err => console.error('[journal] switch date failed:', err));
  });

  // ── TODO：初始化缓存 + 首次渲染 ──
  todosCache = await getTodos();
  renderTodoList();

  // ── TODO：添加新待办（Enter 提交） ──
  els.todoInput.addEventListener('keydown', async e => {
    if (e.key !== 'Enter' || !els.todoInput.value.trim()) return;
    const title = els.todoInput.value.trim();
    const todo = {
      id: genId(),
      title,
      done: false,
      due: els.todoDue.value || null,
      priority: els.todoPriority.value,
    };
    todosCache.unshift(todo);
    els.todoInput.value = '';
    els.todoDue.value = '';
    els.todoPriority.value = 'medium';
    await persistTodos();
  });

  // ── TODO：事件委托（完成切换 / 删除） ──
  els.todoList.addEventListener('click', async e => {
    const item = e.target.closest('.todo-item');
    if (!item) return;
    const id = item.dataset.id;
    const idx = todosCache.findIndex(t => t.id === id);
    if (idx === -1) return;

    if (e.target.classList.contains('todo-check')) {
      todosCache[idx].done = e.target.checked;
    } else if (e.target.classList.contains('todo-delete')) {
      todosCache.splice(idx, 1);
    } else {
      return; // 点击其他区域不处理
    }
    await persistTodos();
  });

  // ── TODO：筛选 Tab 切换 ──
  els.todoFilters.forEach(btn => {
    btn.addEventListener('click', () => {
      els.todoFilters.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      todoFilter = btn.dataset.filter;
      renderTodoList();
    });
  });
}

init().catch(err => console.error('[journal] init failed:', err));
