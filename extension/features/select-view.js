/**
 * select-view.js — 自建下拉框的渲染/交互/定位（features 层）

从 select.js 拆出：选项渲染、选中、开关、定位、键盘。
实例状态 st 由 select.js 构建并传入。
 */

import { GAP, MARGIN, MIN_H, TYPEAHEAD_MS, isPrintable, nextId } from './select.js';

/** 当前打开的实例（同一时刻只允许一个 popover 打开） */
let openState = null;

export function optionSignature(select) {
  return [...select.options].map((o) => o.value + '\x00' + o.text).join('\x01');
}

export function selectedLabel(st) {
  const { select } = st;
  if (select.multiple) {
    const sel = [...select.selectedOptions];
    if (!sel.length) return null;
    return `已选 ${sel.length} 项 · ${sel[0].text}`;
  }
  const opt = select.selectedOptions[0];
  if (!opt) return null;
  return opt.text || null; // 空文本的占位项 → 用 placeholder
}

export function render(st) {
  const { select, valueEl, trigger, placeholder } = st;
  if (!select.isConnected) return;

  valueEl.textContent = selectedLabel(st) ?? placeholder;
  valueEl.classList.toggle('is-placeholder', selectedLabel(st) === null);
  trigger.disabled = Boolean(select.disabled);
  if (select.disabled && st.open) close(st);

  if (!st.ready) return; // 浮层尚未创建，打开时再构建

  const sig = optionSignature(select);
  if (sig !== st.signature) {
    st.signature = sig;
    st.items = buildItems(st);
  }
  syncItems(st);
}

export function buildItems(st) {
  const { select, pop } = st;
  pop.replaceChildren();

  const items = [];
  [...select.options].forEach((opt, i) => {
    const el = document.createElement('div');
    el.className = 'js-select-item';
    el.id = nextId('opt');
    el.setAttribute('role', 'option');
    el.dataset.index = String(i);
    el.dataset.value = opt.value;

    const check = document.createElement('span');
    check.className = 'js-select-check';
    check.setAttribute('aria-hidden', 'true');
    el.append(check);

    const label = document.createElement('span'); // 文本用 textContent（防注入）
    label.className = 'js-select-label';
    label.textContent = opt.text;
    el.append(label);

    el.addEventListener('mousedown', (e) => e.preventDefault()); // 保持焦点在触发器
    el.addEventListener('click', () => choose(st, i));
    el.addEventListener('mouseenter', () => setActive(st, i, false));

    pop.appendChild(el);
    items.push(el);
  });

  if (select.multiple) {
    // 真实 button（component-guidelines：可交互控件用原生元素）；不放 role="option"
    // —— 清除动作不是 listbox 的可选项，避免读屏把它当成第 N+1 个选项。
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'js-select-clear';
    clear.textContent = '清除';
    clear.addEventListener('mousedown', (e) => e.preventDefault());
    clear.addEventListener('click', () => {
      for (const o of select.options) o.selected = false;
      dispatchChange(select);
      render(st);
    });
    pop.appendChild(clear);
  }
  return items;
}

export function syncItems(st) {
  const { select } = st;
  st.items.forEach((el, i) => {
    const opt = select.options[i];
    if (!opt) return;
    el.setAttribute('aria-selected', String(opt.selected));
    el.classList.toggle('is-selected', opt.selected);
  });
  st.activeIndex = defaultActiveIndex(st);
  paintActive(st);
}

export function defaultActiveIndex(st) {
  const { select } = st;
  const i = [...select.options].findIndex((o) => o.selected);
  return i >= 0 ? i : (select.options.length ? 0 : -1);
}

/* ── 选中 ────────────────────────────────────────────── */

export function choose(st, index) {
  const { select } = st;
  const opt = select.options[index];
  if (!opt || opt.disabled) return;

  if (select.multiple) {
    opt.selected = !opt.selected; // 原生多选：逐项切换不影响其他
    dispatchChange(select);
    render(st);
    return;
  }
  select.value = opt.value;
  close(st);
  dispatchChange(select);
  render(st);
  st.trigger.focus();
}

export function dispatchChange(select) {
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/* ── 开关 ────────────────────────────────────────────── */

export function openPop(st) {
  if (openState && openState !== st) close(openState);
  const { select, trigger, pop } = st;

  if (!st.ready) {
    document.body.appendChild(pop);
    st.ready = true;
  }
  pop.dataset.multi = String(select.multiple);
  if (select.multiple) pop.setAttribute('aria-multiselectable', 'true');
  else pop.removeAttribute('aria-multiselectable');

  // 先置 open 再 render：render → syncItems → paintActive 需要 st.open === true
  // 才会写 aria-activedescendant（WAI-ARIA combobox 展开时须指向 active 项）。
  st.open = true;
  openState = st;
  render(st);
  trigger.setAttribute('aria-expanded', 'true');
  pop.hidden = false;
  position(st);

  window.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
  window.addEventListener('resize', onViewportChange);
  document.addEventListener('pointerdown', onDocPointerDown, true);
}

export function close(st) {
  if (!st.open) return;
  const { trigger, pop } = st;
  st.open = false;
  if (openState === st) openState = null;
  trigger.setAttribute('aria-expanded', 'false');
  trigger.removeAttribute('aria-activedescendant');
  pop.hidden = true;

  window.removeEventListener('scroll', onViewportChange, { capture: true });
  window.removeEventListener('resize', onViewportChange);
  document.removeEventListener('pointerdown', onDocPointerDown, true);
}

export function onViewportChange(e) {
  if (!openState) return;
  // 浮层内部滚动（overflow-y:auto）不触发重定位，避免多余重排
  if (e && openState.pop.contains(e.target)) return;
  position(openState);
}

export function onDocPointerDown(e) {
  if (!openState) return;
  const { trigger, pop } = openState;
  if (trigger.contains(e.target) || pop.contains(e.target)) return;
  close(openState);
}

/* ── 定位（design.md §3） ────────────────────────────── */

export function position(st) {
  const { trigger, pop } = st;
  if (!trigger.isConnected) { close(st); return; }

  const r = trigger.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;

  pop.style.maxHeight = '';
  pop.style.left = '0px';
  pop.style.top = '0px';
  const natural = pop.scrollHeight;
  const below = vh - r.bottom - GAP - MARGIN;
  const above = r.top - GAP - MARGIN;
  const openUp = below < Math.min(natural, 120) && above > below;

  const avail = Math.max(0, openUp ? above : below);
  const maxH = Math.max(MIN_H, Math.min(natural, avail));
  pop.style.maxHeight = Math.min(maxH, vh - GAP - 2 * MARGIN) + 'px';

  const h = pop.offsetHeight;
  const w = pop.offsetWidth;
  const top = openUp ? r.top - GAP - h : r.bottom + GAP;

  let left = r.left;
  if (left + w > vw - MARGIN) left = r.right - w;
  left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));

  pop.style.top = Math.max(MARGIN, top) + 'px';
  pop.style.left = left + 'px';
  pop.style.minWidth = Math.min(r.width, vw - 2 * MARGIN) + 'px'; // 防止 320px 下触发器全宽时溢出
}

/* ── 键盘 / active ───────────────────────────────────── */

export function setActive(st, index, scroll = true) {
  st.activeIndex = index;
  paintActive(st);
  if (scroll) {
    st.items[index]?.scrollIntoView({ block: 'nearest' });
  }
}

export function paintActive(st) {
  st.items.forEach((el, i) => el.classList.toggle('is-active', i === st.activeIndex));
  const { trigger, items } = st;
  const cur = items[st.activeIndex];
  if (st.open && cur) trigger.setAttribute('aria-activedescendant', cur.id);
  else trigger.removeAttribute('aria-activedescendant');
}

export function move(st, delta) {
  const n = st.items.length;
  if (!n) return;
  const next = Math.max(0, Math.min(n - 1, st.activeIndex + delta));
  setActive(st, next);
}

export function onKeyDown(st, e) {
  const { select } = st;
  if (select.disabled) return;

  if (e.key === 'Tab') { if (st.open) close(st); return; }

  if (!st.open) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPop(st);
      if (e.key === 'ArrowUp') setActive(st, Math.max(0, st.activeIndex));
      return;
    }
  } else {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(st, 1); return;
      case 'ArrowUp':   e.preventDefault(); move(st, -1); return;
      case 'Home':      e.preventDefault(); setActive(st, 0); return;
      case 'End':       e.preventDefault(); setActive(st, st.items.length - 1); return;
      case 'Enter':
        e.preventDefault();
        if (st.activeIndex >= 0) choose(st, st.activeIndex);
        return;
      case ' ':
        e.preventDefault();
        if (st.activeIndex >= 0) choose(st, st.activeIndex); // 多选时保持打开
        return;
      case 'Escape':
        e.preventDefault();
        close(st);
        return;
    }
  }

  if (isPrintable(e)) {
    e.preventDefault();
    // 折叠态键入可打印字符：按 ARIA combobox 惯例先展开再 typeahead
    if (!st.open) openPop(st);
    typeahead(st, e.key);
  }
}

export function typeahead(st, ch) {
  const now = performance.now();
  if (now - st.typeAt > TYPEAHEAD_MS) st.typeBuf = '';
  st.typeAt = now;
  st.typeBuf += ch.toLowerCase();

  const n = st.items.length;
  if (!n) return;
  const start = st.activeIndex;
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    const text = (st.select.options[i]?.text ?? '').toLowerCase();
    if (text.startsWith(st.typeBuf)) { setActive(st, i); return; }
  }
}
