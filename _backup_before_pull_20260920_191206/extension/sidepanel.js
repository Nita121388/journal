/* ================================================================
   Journal — sidepanel.js
   主界面逻辑：热力图渲染、日期切换、日志编辑、待办操作、host 状态。
   ================================================================ */

'use strict';

import { init, subscribe, getState, getDayContent, setDayContent, addTodo, toggleTodo, deleteTodo, listTodos, listRecordedDates } from './lib/store.js';
import { todayStr, monthName, daysInMonth, firstDayOfMonth, WEEKDAYS, dayOfWeek } from './lib/model.js';
import { onHostStatus, getHostStatus, reconnect } from './lib/bridge.js';
import { getSyncStatus } from './lib/sync.js';

/* ─── 状态 ───────────────────────────────────────────────────── */

let state = null;
let viewMonth = null;      // { year, month } 当前热力图显示的月份
let selectedDate = todayStr();

const els = {};
function $id(id) { return document.getElementById(id); }

/* ─── 初始化 ─────────────────────────────────────────────────── */

async function boot() {
  state = await init();
  const now = new Date();
  viewMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };

  els.prevMonth = $id('prevMonth');
  els.nextMonth = $id('nextMonth');
  els.heatmapGrid = $id('heatmapGrid');
  els.heatmapTitle = $id('heatmapTitle');
  els.dayTitle = $id('dayTitle');
  els.todayBtn = $id('todayBtn');
  els.logEditor = $id('logEditor');
  els.logStatus = $id('logStatus');
  els.todoList = $id('todoList');
  els.addTodoBtn = $id('addTodoBtn');
  els.syncDot = $id('syncDot');
  els.hostDot = $id('hostDot');
  els.statusText = $id('statusText');
  els.optionsBtn = $id('optionsBtn');

  // 事件绑定
  els.prevMonth.addEventListener('click', () => shiftMonth(-1));
  els.nextMonth.addEventListener('click', () => shiftMonth(1));
  els.todayBtn.addEventListener('click', () => {
    selectedDate = todayStr();
    const now = new Date();
    viewMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
    renderAll();
  });
  els.optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

  let saveTimer = null;
  els.logEditor.addEventListener('input', () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveLog(), 600);
    els.logStatus.textContent = '输入中…';
  });
  els.logEditor.addEventListener('blur', () => saveLog());

  els.addTodoBtn.addEventListener('click', () => addTodoInline());

  // 数据变更订阅
  subscribe((s) => {
    state = s;
    renderAll();
  });

  // host 状态订阅
  onHostStatus((status) => {
    renderHostStatus(status);
  });

  renderAll();
  updateHostIndicator();
  updateSyncIndicator();
}

/* ─── 渲染 ───────────────────────────────────────────────────── */

function renderAll() {
  renderHeatmap();
  renderDayTitle();
  renderLog();
  renderTodos();
  updateSyncIndicator();
}

function shiftMonth(delta) {
  let { year, month } = viewMonth;
  month += delta;
  if (month < 1) { month = 12; year--; }
  if (month > 12) { month = 1; year++; }
  viewMonth = { year, month };
  renderHeatmap();
}

function renderHeatmap() {
  const { year, month } = viewMonth;
  els.heatmapTitle.textContent = `${year} 年 ${monthName(month)}`;

  const recorded = listRecordedDates();
  const dim = daysInMonth(year, month);
  const firstDow = firstDayOfMonth(year, month);   // 0=日

  // 7 列表头
  let html = '';
  for (const w of WEEKDAYS) {
    html += `<span class="wk-label">${w}</span>`;
  }
  // 前导空位
  for (let i = 0; i < firstDow; i++) {
    html += '<span class="heatmap-cell blank"></span>';
  }
  // 日期格
  for (let d = 1; d <= dim; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr();
    const isSelected = dateStr === selectedDate;
    const hasLog = recorded.has(dateStr) && getDayContent(dateStr).trim();
    const hasTodo = recorded.has(dateStr) && !hasLog;

    let cls = 'heatmap-cell';
    if (hasLog) cls += ' log';
    else if (hasTodo) cls += ' todo';
    if (isToday) cls += ' today';
    if (isSelected) cls += ' selected';

    html += `<span class="${cls}" data-date="${dateStr}" title="${dateStr}"></span>`;
  }
  els.heatmapGrid.innerHTML = html;

  // 点击选日期
  els.heatmapGrid.querySelectorAll('.heatmap-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      selectedDate = cell.dataset.date;
      renderAll();
    });
  });
}

function renderDayTitle() {
  const d = new Date(selectedDate + 'T00:00:00');
  const weekday = WEEKDAYS[d.getDay()];
  const month = d.getMonth() + 1;
  const day = d.getDate();
  els.dayTitle.textContent = `${month}月${day}日 · 周${weekday}`;
}

function renderLog() {
  const content = getDayContent(selectedDate);
  if (document.activeElement !== els.logEditor) {
    els.logEditor.value = content;
  }
  els.logStatus.textContent = content ? '' : '还没有记录，写下今天做了什么 ✍️';
}

function renderTodos() {
  const todos = listTodos({ dueDate: selectedDate });
  if (!todos.length) {
    els.todoList.innerHTML = '<div class="todo-empty">这一天没有待办</div>';
    return;
  }
  els.todoList.innerHTML = todos.map(t => {
    const prio = t.priority === 'high' ? '高' : t.priority === 'low' ? '低' : '中';
    return `
      <div class="todo-item ${t.done ? 'done' : ''}" data-id="${t.id}">
        <input type="checkbox" class="todo-check" ${t.done ? 'checked' : ''} title="完成">
        <span class="todo-text">${escapeHtml(t.text)}</span>
        <span class="todo-priority ${t.priority}">${prio}</span>
        <button class="todo-del" title="删除">✕</button>
      </div>`;
  }).join('');

  els.todoList.querySelectorAll('.todo-item').forEach(item => {
    const id = item.dataset.id;
    const check = item.querySelector('.todo-check');
    check.addEventListener('change', () => toggleTodo(id).then(renderTodos));
    item.querySelector('.todo-del').addEventListener('click', async () => {
      if (confirm('删除这条待办？')) {
        await deleteTodo(id);
        renderTodos();
      }
    });
  });
}

function addTodoInline() {
  const row = document.createElement('div');
  row.className = 'todo-input-row';
  row.innerHTML = `
    <input type="text" class="todo-input" placeholder="写点什么…">
    <input type="date" class="todo-date" value="${selectedDate}">
    <button class="btn primary">添加</button>`;
  els.todoList.prepend(row);

  const input = row.querySelector('.todo-input');
  const dateInput = row.querySelector('.todo-date');
  const btn = row.querySelector('button');
  input.focus();

  const commit = async () => {
    const text = input.value.trim();
    if (!text) { row.remove(); return; }
    await addTodo({ text, dueDate: dateInput.value || selectedDate });
    renderTodos();
  };
  btn.addEventListener('click', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
  input.addEventListener('blur', () => setTimeout(() => {
    if (!input.value.trim()) row.remove();
  }, 200));
}

/* ─── 保存日志 ───────────────────────────────────────────────── */

async function saveLog() {
  const content = els.logEditor.value;
  await setDayContent(selectedDate, content);
  els.logStatus.textContent = content.trim() ? '已保存 ✓' : '';
  renderHeatmap();
  setTimeout(() => { els.logStatus.textContent = content.trim() ? '' : '还没有记录，写下今天做了什么 ✍️'; }, 1500);
}

/* ─── 状态指示 ───────────────────────────────────────────────── */

function renderHostStatus(status) {
  if (status.connected) {
    els.hostDot.classList.add('on');
    els.statusText.textContent = '本机 Agent 已连接';
  } else {
    els.hostDot.classList.remove('on');
    els.statusText.textContent = status.reason === 'no-token'
      ? '未配置本机 Agent（设置 → 本机 Agent）'
      : '本机 Agent 未连接（运行 journal-host）';
  }
}

function updateHostIndicator() {
  const st = getHostStatus();
  renderHostStatus(st);
}

function updateSyncIndicator() {
  const s = getSyncStatus();
  if (s.provider === 'off') {
    els.syncDot.className = 'sync-dot off';
  } else {
    els.syncDot.className = 'sync-dot on';
  }
}

/* ─── 工具 ───────────────────────────────────────────────────── */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

boot().catch(e => {
  console.error('[journal] boot failed', e);
  els.statusText && (els.statusText.textContent = '初始化失败: ' + e.message);
});