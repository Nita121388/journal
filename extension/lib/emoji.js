/* ================================================================
   Journal — lib/emoji.js
   轻量 emoji Picker：分类浏览 + 搜索 + 最近使用 + 自由输入。
   数据来自 lib/emoji-data.js（完整库，含中英文关键词）。
   最近使用存 localStorage['journal.recentEmojis']。
   ================================================================ */

import { EMOJI_DB, EMOJI_CATS } from './emoji-data.js';

const RECENT_MAX = 15;
const RECENT_KEY = 'journal.recentEmojis';

export function getRecentEmojis() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

export function recordRecentEmoji(char) {
  const cur = getRecentEmojis();
  const next = [char, ...cur.filter(c => c !== char)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* noop */ }
}

/** 搜索 emoji。匹配优先级：emoji 字符 > 短码前缀 > 名称前缀 > 子串。空查询返回 null。 */
export function searchEmojis(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return null;
  const exact = [];
  const prefix = [];
  const sub = [];
  for (const item of EMOJI_DB) {
    const haystack = `${item.e} ${item.n} ${item.k}`.toLowerCase();
    if (item.e === q) exact.push(item);
    else if (item.k.toLowerCase().includes(q) || item.n.toLowerCase().startsWith(q)) prefix.push(item);
    else if (haystack.includes(q)) sub.push(item);
  }
  return [...exact, ...prefix, ...sub].slice(0, 48);
}

/** 获取分类下的 emoji 列表 */
export function emojisByCat(catId) {
  return EMOJI_DB.filter(e => e.c === catId);
}

export { EMOJI_DB, EMOJI_CATS };

/* ---------- 渲染 ---------- */

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * 渲染 emoji picker 到 container。
 * @param {HTMLElement} container  承载 picker 的容器（其 innerHTML 会被替换）
 * @param {(char:string)=>void} onPick  选择回调
 * @param {{selected?:string}} opts
 */
export function renderEmojiPicker(container, onPick, { selected = '' } = {}) {
  const cats = EMOJI_CATS;
  let activeCat = 'smileys';
  let query = '';

  function gridOf(items) {
    return `<div class="ep-grid">${items.map(it =>
      `<button type="button" class="ep-emoji${selected === it.e ? ' selected' : ''}" data-char="${esc(it.e)}" title="${esc(it.n)}">${it.e}</button>`
    ).join('')}</div>`;
  }

  function render() {
    const recents = getRecentEmojis();
    let inner = '';

    if (query) {
      const results = searchEmojis(query) || [];
      inner = results.length
        ? gridOf(results)
        : `<div class="ep-empty">没有找到「${esc(query)}」相关的 emoji</div>`;
    } else {
      if (recents.length) {
        inner += `<div class="ep-recent">
          <div class="ep-recent-head">🕘 最近使用</div>
          <div class="ep-recent-grid">${gridOf(recents.map(c => ({ e: c, n: '最近使用', k: '', c: '' })))}</div>
        </div>`;
      }
      inner += `<div class="ep-cats">${cats.map(c =>
        `<button type="button" class="ep-cat${activeCat === c.id ? ' active' : ''}" data-cat="${c.id}" title="${esc(c.label)}">${c.icon}</button>`
      ).join('')}</div>`;
      inner += gridOf(emojisByCat(activeCat));
    }

    container.innerHTML = `
      <div class="ep-wrap">
        <div class="ep-search">
          <span class="mag">🔍</span>
          <input type="text" class="ep-search-input" placeholder="搜索 emoji…（中文/英文/拼音）" autocomplete="off">
          <span class="ep-count"></span>
        </div>
        <div class="ep-body">${inner}</div>
      </div>`;

    const input = container.querySelector('.ep-search-input');
    input.addEventListener('input', () => { query = input.value.trim(); render(); });

    container.querySelectorAll('.ep-emoji').forEach(btn => {
      btn.addEventListener('click', () => onPick(btn.dataset.char));
    });
    container.querySelectorAll('.ep-cat').forEach(btn => {
      btn.addEventListener('click', () => { activeCat = btn.dataset.cat; render(); });
    });
  }

  render();
  return () => { container.innerHTML = ''; };
}
