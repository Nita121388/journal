/**
 * template-fields.js — 字段选择器、属性行菜单、行内图标选择、默认值编辑器（features 层）
 */

import { listFieldDefs } from '../shared/field-registry.js';
import { PROP_TYPES, defaultValueForType, inferProp } from '../shared/prop-infer.js';
import { recordRecentEmoji, renderEmojiPicker } from './emoji.js';
import { showToast } from './toast.js';
import {
  REQUIRED_DEFS, renderTemplateBuilder, tplBuilderState, tplPropList, typeLabel,
} from './template-builder.js';
import {
  markUserTouched, requestLlmSuggestion, startNameEdit, startNewNameEdit,
} from './template-rows.js';
import { openTplEditProp } from './template-menu.js';

export let fieldPickerEl = null;
let fieldPickerCleanup = null;

export function closeFieldPicker() {
  fieldPickerCleanup?.();
  fieldPickerCleanup = null;
  fieldPickerEl?.remove();
  fieldPickerEl = null;
}

/** 模板里已占用的 key（必选锁定行 + 已加入的 extra） */
function tplUsedKeys() {
  return new Set([...REQUIRED_DEFS.map(d => d.key), ...tplBuilderState.extra.map(e => e.key)]);
}

/** 选中一个现有字段 → 加入模板 */
function addExistingPropToTemplate(def) {
  if (tplBuilderState.extra.some(e => e.key === def.key)) { showToast(`「${def.label}」已在模板中`, ''); return; }
  tplBuilderState.extra.push({ key: def.key, def: { ...def } });
  tplBuilderState.values[def.key] = defaultValueForType(def.type);
  closeFieldPicker();
  renderTemplateBuilder();
  showToast(`已添加属性「${def.label || def.key}」`, 'success');
}

export function openFieldPicker(anchor) {
  closeFieldPicker();
  const menu = document.createElement('div');
  menu.className = 'tpl-ctx-menu tpl-field-picker';
  fieldPickerEl = menu;

  const used = tplUsedKeys();
  const group = (title) => {
    const h = document.createElement('div');
    h.className = 'tpl-picker-group';
    h.textContent = title;
    return h;
  };
  const defItem = (def) => {
    const added = used.has(def.key);
    const label = `${def.icon || ''} ${def.label || def.key}`;
    const item = ctxItem(added ? `${label}  ✓` : label, () => {
      if (added) { showToast(`「${def.label || def.key}」已在模板中`, ''); return; }
      addExistingPropToTemplate(def);
    });
    if (added) item.disabled = true;
    return item;
  };

  // 顶部：新建（默认高亮）
  const newItem = ctxItem('＋ 新建自定义属性…', () => { closeFieldPicker(); startAddProp(); });
  newItem.classList.add('is-active');
  menu.append(newItem, menuSep());

  // 内建可选
  const optional = listFieldDefs({ source: 'builtin', required: false });
  if (optional.length) {
    menu.append(group('内建可选'));
    for (const def of optional) menu.append(defItem(def));
  }

  // 属性库
  const userDefs = listFieldDefs({ source: 'user' });
  menu.append(menuSep(), group('属性库'));
  if (userDefs.length) for (const def of userDefs) menu.append(defItem(def));
  else {
    const empty = document.createElement('div');
    empty.className = 'tpl-picker-empty';
    empty.textContent = '（空）';
    menu.append(empty);
  }

  document.body.append(menu);
  // 定位：贴 anchor 下方，超出视口则上翻
  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8)) + 'px';
  const onDown = (e) => { if (!menu.contains(e.target) && e.target !== anchor) closeFieldPicker(); };
  const onKey = (e) => { if (e.key === 'Escape') closeFieldPicker(); };
  setTimeout(() => {
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
  }, 0);
  fieldPickerCleanup = () => {
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('keydown', onKey);
  };
}

/** 新增属性：先给一个默认行，再进入命名编辑（输入即自动推断） */
export function startAddProp() {
  const used = [...REQUIRED_DEFS.map(d => d.key), ...tplBuilderState.extra.map(x => x.key)];
  const seed = inferProp('新属性', { existingKeys: used });
  const entry = {
    key: seed.key,
    def: { key: seed.key, label: '新属性', icon: seed.icon, type: seed.type, ...(seed.options ? { options: seed.options } : {}) },
  };
  tplBuilderState.extra.push(entry);
  tplBuilderState.values[entry.key] = seed.defaultValue;
  renderTemplateBuilder();
  const rows = tplPropList.querySelectorAll('.tpl-extra-row');
  const row = rows[rows.length - 1];
  const nameEl = row?.querySelector('.tpl-prop-name');
  if (row && nameEl) startNewNameEdit(row, nameEl, entry);
}

/* ── 排序 / 移除 ──────────────────────────────────────────── */

export function reorderExtra(from, to) {
  const arr = tplBuilderState.extra;
  const i = arr.findIndex(x => x.key === from);
  const j = arr.findIndex(x => x.key === to);
  if (i < 0 || j < 0) return;
  const [it] = arr.splice(i, 1);
  arr.splice(j, 0, it);
  renderTemplateBuilder();
}
function moveExtra(key, dir) {
  const arr = tplBuilderState.extra;
  const i = arr.findIndex(x => x.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return;
  const [it] = arr.splice(i, 1);
  arr.splice(j, 0, it);
  renderTemplateBuilder();
}
export function removeExtra(key) {
  tplBuilderState.extra = tplBuilderState.extra.filter(x => x.key !== key);
  delete tplBuilderState.values[key];
  renderTemplateBuilder();
}

/** 修改属性类型：旧默认值不再适用 → 重置为该类型空值 */
function changePropType(key, type) {
  const entry = tplBuilderState.extra.find(x => x.key === key);
  if (!entry || entry.def.type === type) return;
  const label = entry.def.label || key;
  entry.def.type = type;
  if (type !== 'select' && type !== 'multi' && type !== 'status') delete entry.def.options;
  tplBuilderState.values[key] = defaultValueForType(type);
  markUserTouched(key);
  renderTemplateBuilder();
  showToast(`已将「${label}」改为${typeLabel(type)}`, '');
}

/* ── 行右键菜单 ───────────────────────────────────────────── */

export let propRowMenuEl = null;
let propRowMenuCleanup = null;

export function closePropRowMenu() {
  propRowMenuCleanup?.();
  propRowMenuCleanup = null;
  propRowMenuEl?.remove();
  propRowMenuEl = null;
}
function menuSep() { const s = document.createElement('div'); s.className = 'tpl-ctx-sep'; return s; }
function ctxItem(text, onClick, cls = '') {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'tpl-ctx-item' + (cls ? ' ' + cls : '');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

export function openPropRowMenu(row, key, def, locked, x, y) {
  closePropRowMenu();
  const menu = document.createElement('div');
  menu.id = 'tpl-prop-menu';
  menu.className = 'tpl-ctx-menu';
  propRowMenuEl = menu;

  const buildActions = () => {
    menu.replaceChildren();
    menu.append(ctxItem(locked ? '编辑属性（名称 / 图标）' : '编辑属性…', () => {
      closePropRowMenu();
      const n = row.querySelector('.tpl-prop-name');
      if (locked) { if (n) startNameEdit(row, n, key, def, true); }
      else openTplEditProp(key);
    }));
    if (locked) return;
    menu.append(ctxItem(`修改属性类型（当前：${typeLabel(def.type)}）▸`, () => buildTypes(), 'tpl-ctx-sub'));
    menu.append(ctxItem('✨ AI 重新推断', () => {
      closePropRowMenu();
      const entry = tplBuilderState.extra.find(x => x.key === key);
      if (entry) void requestLlmSuggestion(row, entry, { force: true });
    }, 'tpl-ctx-ai'));
    menu.append(menuSep());
    const up = ctxItem('↑ 上移', () => { closePropRowMenu(); moveExtra(key, -1); });
    const down = ctxItem('↓ 下移', () => { closePropRowMenu(); moveExtra(key, 1); });
    if (tplBuilderState.extra[0]?.key === key) up.disabled = true;
    if (tplBuilderState.extra[tplBuilderState.extra.length - 1]?.key === key) down.disabled = true;
    menu.append(up, down);
    menu.append(menuSep());
    menu.append(ctxItem('✕ 从模板移除', () => { closePropRowMenu(); removeExtra(key); }, 'tpl-ctx-del'));
  };

  const buildTypes = () => {
    menu.replaceChildren();
    const back = ctxItem('‹ 返回', () => buildActions(), 'tpl-ctx-back');
    menu.append(back, menuSep());
    for (const t of PROP_TYPES) {
      menu.append(ctxItem(`${t.value === def.type ? '●' : '○'} ${t.label}`, () => {
        closePropRowMenu();
        changePropType(key, t.value);
      }, t.value === def.type ? 'is-active' : ''));
    }
  };

  buildActions();
  document.body.append(menu);
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8)) + 'px';
  const onDown = (e) => { if (!menu.contains(e.target)) closePropRowMenu(); };
  const onKey = (e) => { if (e.key === 'Escape') closePropRowMenu(); };
  setTimeout(() => {
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
  }, 0);
  propRowMenuCleanup = () => {
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('keydown', onKey);
  };
}

/* ── 行内图标选择器（浮层） ───────────────────────────────── */

export let rowIconPop = null;
let rowIconCleanup = null;

export function closeRowIconPicker() {
  rowIconCleanup?.();
  rowIconCleanup = null;
  rowIconPop?.remove();
  rowIconPop = null;
}

export function openRowIconPicker(anchor, current, onPick) {
  closeRowIconPicker();
  const pop = document.createElement('div');
  pop.className = 'tpl-prop-icon-pop';
  rowIconPop = pop;
  document.body.append(pop);
  const pickerCleanup = renderEmojiPicker(pop, (char) => {
    recordRecentEmoji(char);
    onPick(char);
    closeRowIconPicker();
  }, { selected: current || '' });
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = Math.min(r.bottom + 4, Math.max(8, window.innerHeight - pop.offsetHeight - 8)) + 'px';
  const onDown = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) closeRowIconPicker(); };
  const onKey = (e) => { if (e.key === 'Escape') closeRowIconPicker(); };
  setTimeout(() => {
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
  }, 0);
  rowIconCleanup = () => {
    pickerCleanup?.();
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('keydown', onKey);
  };
}

/** 按属性类型构建默认值编辑器，改动写入 tplBuilderState.values */
export function buildTplDefaultEditor(def) {
  const key = def.key;
  const set = (v) => { tplBuilderState.values[key] = v; };
  const cur = tplBuilderState.values[key];
  if (def.type === 'status' || def.type === 'select') {
    const sel = document.createElement('select'); sel.className = 'prop-input';
    sel.append(new Option('', ''));
    for (const o of def.options || []) sel.append(new Option(o, o));
    sel.value = cur ?? '';
    sel.addEventListener('change', () => set(sel.value));
    return sel;
  }
  if (def.type === 'multi') {
    const sel = document.createElement('select'); sel.className = 'prop-input'; sel.multiple = true;
    for (const o of def.options || []) sel.append(new Option(o, o));
    if (Array.isArray(cur)) for (const op of sel.options) op.selected = cur.includes(op.value);
    sel.addEventListener('change', () => set([...sel.selectedOptions].map(o => o.value)));
    return sel;
  }
  if (def.type === 'checkbox') {
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'prop-input'; cb.checked = Boolean(cur);
    cb.addEventListener('change', () => set(cb.checked));
    return cb;
  }
  if (def.type === 'schedule') {
    const v = cur && typeof cur === 'object' ? cur : {};
    const w = document.createElement('div'); w.className = 'tpl-schedule';
    const s = document.createElement('input'); s.type = 'time'; s.className = 'prop-input'; s.value = v.start || ''; s.title = '开始';
    const e = document.createElement('input'); e.type = 'time'; e.className = 'prop-input'; e.value = v.end || ''; e.title = '结束';
    const d = document.createElement('input'); d.type = 'number'; d.className = 'prop-input'; d.min = 0; d.value = v.duration ?? ''; d.title = '时长(分)';
    const sync = () => set({ start: s.value, end: e.value, duration: d.value === '' ? null : Number(d.value) });
    [s, e, d].forEach(x => x.addEventListener('change', sync));
    w.append(s, e, d);
    return w;
  }
  if (def.type === 'tags') {
    const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'prop-input'; inp.placeholder = '逗号分隔';
    inp.value = Array.isArray(cur) ? cur.join(', ') : (cur ?? '');
    inp.addEventListener('change', () => set(inp.value.trim() ? inp.value.split(/[,，]/).map(x => x.trim()).filter(Boolean) : []));
    return inp;
  }
  if (def.type === 'textarea') {
    const ta = document.createElement('textarea');
    ta.className = 'prop-input'; ta.rows = 2;
    ta.value = (cur === null || cur === undefined) ? '' : String(cur);
    ta.addEventListener('change', () => set(ta.value));
    return ta;
  }
  const inp = document.createElement('input');
  inp.type = def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : def.type === 'time' ? 'time' : 'text';
  inp.className = 'prop-input';
  inp.value = (cur === null || cur === undefined) ? '' : String(cur);
  inp.addEventListener('change', () => set(inp.type === 'number' ? Number(inp.value) : inp.value));
  return inp;
}

/** 默认值兜底 */
export function defaultTplValue(def) {
  if (def.type === 'status' || def.type === 'select') return '';
  if (def.type === 'checkbox') return false;
  if (def.type === 'tags') return [];
  if (def.type === 'schedule') return null;
  return '';
}
