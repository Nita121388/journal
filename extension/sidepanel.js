/**
 * sidepanel.js — 侧边栏主界面胶水层
 * 职责：DOM 事件绑定 → 调用 lib/store.js → 调用 lib/ui/*.js 渲染
 * 规则：不直接碰 chrome.storage.*（走 lib/store.js），不 mix storage + render
 */

import { todayKey, aggregateHeatmap, todoSummary, dateRange } from './lib/model.js';
import { getJournal, saveJournal, getJournalsForHeatmap, subscribeJournals, getSettings } from './lib/store.js';

/* ─── 防抖 ────────────────────────────────────────────── */

/**
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
function debounce(fn, ms = 500) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/* ─── 渲染 ────────────────────────────────────────────── */

/**
 * @param {HTMLElement} container — 热力图容器
 * @param {Record<string, number>} heatmap
 */
function renderHeatmap(container, heatmap) {
  container.replaceChildren();
  const today = todayKey();
  const days = dateRange(365);
  for (const day of days) {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.dataset.day = day;
    const count = heatmap[day] ?? 0;
    cell.title = count > 0 ? `${day}` : `${day}（未记录）`;
    if (count > 0) {
      cell.classList.add('is-filled');
      if (day === today) cell.classList.add('is-today');
    }
  }
}

/**
 * @param {HTMLElement} statusEl
 * @param {string} text
 */
function showSaveStatus(statusEl, text) {
  statusEl.textContent = text;
  statusEl.classList.add('visible');
  setTimeout(() => {
    statusEl.classList.remove('visible');
    statusEl.textContent = '';
  }, 1500);
}

/* ─── 数据加载与事件绑定 ──────────────────────────────── */

const els = {
  todayDisplay: document.getElementById('today-display'),
  textarea: document.getElementById('journal-input'),
  status: document.getElementById('save-status'),
  heatmap: document.getElementById('heatmap-container'),
};

async function renderToday() {
  const key = todayKey();
  if (els.todayDisplay) {
    const d = new Date();
    els.todayDisplay.textContent = d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  }
  const text = await getJournal(key);
  if (els.textarea) {
    els.textarea.value = text;
  }
}

async function renderAll() {
  await renderToday();
  const journals = await getJournalsForHeatmap();
  renderHeatmap(els.heatmap, aggregateHeatmap(journals));
}

async function init() {
  const settings = await getSettings();
  if (settings.theme === 'dark' ||
      (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.dataset.theme = 'dark';
  }

  await renderAll();

  const debouncedSave = debounce(async () => {
    await saveJournal(todayKey(), els.textarea.value);
    showSaveStatus(els.status, '已保存 ✓');
    // 重新渲染热力图以反映当前输入状态
    const journals = await getJournalsForHeatmap();
    renderHeatmap(els.heatmap, aggregateHeatmap(journals));
  }, 500);

  els.textarea.addEventListener('input', debouncedSave);

  // 同步/外部变更（如 WebDAV）写入时刷新
  // 同步/外部变更（如 WebDAV）写入时刷新
  subscribeJournals(journals => {
    renderHeatmap(els.heatmap, aggregateHeatmap(journals));
  });
}

init().catch(err => {
  console.error('[journal] init failed:', err);
});
