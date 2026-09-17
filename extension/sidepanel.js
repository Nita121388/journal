/**
 * sidepanel.js — 侧边栏主界面胶水层
 * 职责：DOM 事件绑定 → 调用 lib/store.js → 渲染
 * 规则：不直接碰 chrome.storage.*（走 lib/store.js），不 mix storage + render
 */

import { todayKey, aggregateHeatmap, todoSummary, dateRange } from './lib/model.js';
import {
  getJournal, saveJournal,
  getJournalsForHeatmap, subscribeJournals,
  getTodos, saveTodos,
  getSettings,
} from './lib/store.js';

/* ─── 工具函数 ──────────────────────────────────────── */

/**
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
function debounce(fn, ms = 500) {
  let timer = null;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

/** @returns {string} */
function genId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

/** @param {string|null} due @returns {boolean} */
function isOverdue(due) { return due != null && due < todayKey(); }

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

/** @param {HTMLElement} statusEl @param {string} text */
function showSaveStatus(statusEl, text) {
  statusEl.textContent = text;
  statusEl.classList.add('visible');
  setTimeout(() => { statusEl.classList.remove('visible'); statusEl.textContent = ''; }, 1500);
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
};

/* ─── 初始化 ────────────────────────────────────────── */

async function renderToday() {
  if (els.todayDisplay) {
    const d = new Date();
    els.todayDisplay.textContent = d.toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    });
  }
  const text = await getJournal(todayKey());
  els.textarea.value = text;
}

async function renderAll() {
  await renderToday();
  renderHeatmap(els.heatmap, aggregateHeatmap(await getJournalsForHeatmap()));
}

async function init() {
  // 主题
  const settings = await getSettings();
  if (settings.theme === 'dark' ||
      (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.dataset.theme = 'dark';
  }

  await renderAll();

  // ── 日志保存（debounce） ──
  const debouncedSave = debounce(async () => {
    await saveJournal(todayKey(), els.textarea.value);
    showSaveStatus(els.status, '已保存 ✓');
    renderHeatmap(els.heatmap, aggregateHeatmap(await getJournalsForHeatmap()));
  });
  els.textarea.addEventListener('input', debouncedSave);

  // 外部存储变更刷新热力图
  subscribeJournals(journals => renderHeatmap(els.heatmap, aggregateHeatmap(journals)));

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
  for (const btn of els.todoFilters) {
    btn.addEventListener('click', () => {
      for (const b of els.todoFilters) b.classList.remove('active');
      btn.classList.add('active');
      todoFilter = btn.dataset.filter;
      renderTodoList();
    });
  }
}

init().catch(err => console.error('[journal] init failed:', err));
