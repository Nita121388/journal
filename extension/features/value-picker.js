/**
 * value-picker.js — 属性值编辑浮层（features 层）
 *
 * 交互参考 snorkeling 的 property-tag-editor（2026-11-10，用户指定）：
 *   - chips 与搜索输入同一行流（已选项是 chip，点 × 删）
 *   - 输入即过滤候选（忽略大小写、包含匹配 label 与 value）
 *   - 无匹配且输入非空 → 出现「创建 "xxx"」行，Enter / 点击即创建
 *   - 多选：点候选 toggle；单选：点即选中并关闭
 *   - 键盘：↑↓ 移高亮、Enter 选中/创建、Backspace（空输入）删最后一个 chip
 *
 * 候选同时支持两种形态：`'todo'` 或 `{ value: 'todo', label: '未开始' }`。
 * 值（value）是写回数据的键；label 只用于展示与搜索（状态 key 与中文名分离）。
 *
 * 关闭语义：Esc / 外点由 features/layer-stack.js 统一派发（pushLayer 登记），
 * 与 editor-field-picker / template-picker 同一套规则 —— 只关本浮层，不碰编辑器。
 *
 * 数据语义：本组件不持久化任何东西；每次变更即回调 onChange/onPick，
 * 由调用方（card-editor.js）写回自己的编辑态。
 */

import { createChip } from '../components/chip.js';
import { popLayer, pushLayer } from './layer-stack.js';

const PICKER_ID = 'value-picker';

let root = null;
/** 键盘高亮索引（对可见候选行，含「创建」行） */
let activeIndex = 0;

/** 关闭浮层（幂等） */
export function closeValuePicker() {
  root?.remove();
  root = null;
  popLayer(PICKER_ID);
}

/** 候选归一化：字符串 → { value, label } */
export function normalizeOptions(options) {
  return (options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

/** 候选过滤：包含匹配（label 或 value）、忽略大小写（与参考实现一致） */
export function filterOptions(options, draft) {
  const q = String(draft ?? '').trim().toLowerCase();
  if (q === '') return options;
  return options.filter((o) =>
    String(o.label).toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q));
}

/** 是否显示「创建」行：输入非空且候选里没有同名项（忽略大小写） */
export function canCreateOption(draft, options) {
  const value = String(draft ?? '').trim();
  if (value === '') return false;
  return !options.some((o) =>
    String(o.label).toLowerCase() === value.toLowerCase()
    || String(o.value).toLowerCase() === value.toLowerCase());
}

/** 把浮层贴到锚点下方，越界时上翻 / 左右夹紧（与 editor-field-picker 同规则） */
function place(el, anchor) {
  const rect = anchor.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - el.offsetWidth - 8))}px`;
  const below = rect.bottom + 4;
  const overflow = below + el.offsetHeight > window.innerHeight - 8;
  el.style.top = `${Math.max(8, overflow ? rect.top - el.offsetHeight - 4 : below)}px`;
}

/**
 * 打开属性值编辑浮层。
 *
 * @param {HTMLElement|null} anchor 锚点（属性行的值格按钮）
 * @param {{
 *   selected?: string[],
 *   options?: Array<string|{value: string, label: string}>,
 *   multiple?: boolean,
 *   placeholder?: string,
 *   onChange?: (values: string[]) => void,
 *   onPick?: (value: string) => void,
 *   createLabel?: (value: string) => string,
 * }} [opts]
 */
export function openValuePicker(anchor, {
  selected = [],
  options = [],
  multiple = true,
  placeholder = '搜索或输入选项',
  onChange,
  onPick,
  createLabel = (v) => `创建 "${v}"`,
} = {}) {
  closeValuePicker();
  if (!anchor) return;

  const candidates = normalizeOptions(options);
  const labelOf = (value) =>
    candidates.find((o) => o.value === value)?.label ?? value;
  const state = { chips: [...selected], draft: '' };

  // ── DOM 骨架 ──
  root = document.createElement('div');
  root.id = PICKER_ID;
  root.className = 'value-picker';
  root.setAttribute('role', 'dialog');

  const row = document.createElement('div');
  row.className = 'vp-chips-row';
  const chipsEl = document.createElement('div');
  chipsEl.className = 'vp-chips';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'vp-input';
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder);
  input.autocomplete = 'off';
  row.append(chipsEl, input);

  const list = document.createElement('div');
  list.className = 'vp-list';
  list.setAttribute('role', 'listbox');

  root.append(row, list);

  // ── 渲染（chips + 候选列表 + 创建行）──
  function renderChips() {
    chipsEl.replaceChildren();
    for (const value of state.chips) {
      chipsEl.append(createChip({
        label: labelOf(value),
        onRemove: () => {
          state.chips = state.chips.filter((v) => v !== value);
          onChange?.([...state.chips]);
          renderChips();
          renderList();
        },
      }));
    }
  }

  /** 可见行：候选（含 value 与 label）+ 可选的「创建」行（label 即输入原文） */
  function visibleItems() {
    const items = filterOptions(candidates, state.draft);
    const out = items.map((o) => ({ kind: 'option', value: o.value, label: o.label }));
    if (canCreateOption(state.draft, candidates)) {
      out.push({ kind: 'create', value: state.draft.trim(), label: createLabel(state.draft.trim()) });
    }
    return out;
  }

  function renderList() {
    list.replaceChildren();
    const visible = visibleItems();
    if (activeIndex >= visible.length) activeIndex = Math.max(0, visible.length - 1);
    visible.forEach((item, i) => {
      const el = document.createElement('div');
      el.setAttribute('role', 'option');
      if (item.kind === 'create') {
        el.className = 'vp-item vp-create';
        el.textContent = item.label;
        el.addEventListener('click', () => { commit(item.value); });
      } else {
        el.className = 'vp-item';
        const label = document.createElement('span');
        label.textContent = item.label;
        el.append(label);
        if (state.chips.includes(item.value)) {
          el.classList.add('is-selected');
          const check = document.createElement('span');
          check.className = 'vp-check';
          check.textContent = '✓';
          check.setAttribute('aria-hidden', 'true');
          el.append(check);
        }
        el.addEventListener('click', () => { pick(item.value); });
      }
      if (i === activeIndex) el.classList.add('is-active');
      list.append(el);
    });
  }

  // ── 行为 ──
  function commit(draft) {
    const value = String(draft ?? '').trim();
    if (!value) return;
    if (!multiple) {
      state.chips = [value];
      onPick?.(value);
      closeValuePicker();
      return;
    }
    if (state.chips.some((c) => c.toLowerCase() === value.toLowerCase())) return;
    state.chips = [...state.chips, value];
    onChange?.([...state.chips]);
    input.value = '';
    state.draft = '';
    renderChips();
    renderList();
  }

  function pick(value) {
    if (!multiple) { commit(value); return; }
    const exists = state.chips.includes(value);
    state.chips = exists
      ? state.chips.filter((c) => c !== value)
      : [...state.chips, value];
    onChange?.([...state.chips]);
    renderChips();
    renderList();
  }

  input.addEventListener('input', () => {
    state.draft = input.value;
    activeIndex = 0;
    renderList();
  });

  input.addEventListener('keydown', (e) => {
    const visible = visibleItems();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!visible.length) return;
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      activeIndex = (activeIndex + delta + visible.length) % visible.length;
      renderList();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = visible[activeIndex];
      if (!target) return;
      if (target.kind === 'create') commit(target.value);
      else pick(target.value);
      return;
    }
    if (e.key === 'Backspace' && input.value === '' && multiple && state.chips.length) {
      e.preventDefault();
      state.chips = state.chips.slice(0, -1);
      onChange?.([...state.chips]);
      renderChips();
      renderList();
    }
  });

  renderChips();
  renderList();
  document.body.append(root);
  place(root, anchor);
  input.focus();

  // 登记：Esc / 外点（点锚点除外）由 layer-stack 统一派发。
  // 注册发生在 click 之后，而外点用 mousedown 判定 —— 打开的这次点击不会自己关掉自己。
  pushLayer({ id: PICKER_ID, el: root, close: closeValuePicker, ignore: [anchor] });
}
