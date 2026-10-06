/**
 * select.js — 自建下拉框（BoardUI Select 风格）
 *
 * 架构：保留原生 <select> 作为唯一数据源（visually-hidden），只把外观替换为
 * 「代理触发器 + 自绘非模态 popover」。因此：
 *   - .value 读写 / change 事件 / new Option / sel.append / .multiple / .selectedOptions
 *     全部继续由原生控件提供，现有调用点无需改动（R6 零回归）。
 *   - 外部代码直接给 select.value 赋值时，组件在实例上 patch 了 value 访问器
 *     （patchValueAccessor），拦截赋值并触发重绘。注意：不能用
 *     attributes:['selected'] 的 MutationObserver——option.selected / select.value
 *     只改内部选中态，不反映到 selected 内容属性（对应 defaultSelected）。
 *     实测确认，详见 design.md §2。
 *   - JS 未执行（组件未增强）时原生 select 仍然可见可用（渐进增强）。
 *
 * 视觉参照 BoardUI Select：弱描边 + 大圆角 + 极弱投影 + 200ms 过渡 +
 * ring-offset 焦点环 + 16px 描边 chevron（展开旋转）。
 *
 * 详见 .trellis/tasks/09-30-custom-select-component/design.md
 */

/* ── 常量 ────────────────────────────────────────────── */

const GAP = 6;        // 触发器与浮层间距
const MARGIN = 8;     // 视口安全边距
const MIN_H = 96;     // 浮层最小高度
const TYPEAHEAD_MS = 600;

let seq = 0;
const nextId = (p) => `jsel-${p}-${++seq}`;

/** 当前打开的实例（同一时刻只允许一个 popover 打开） */
let openState = null;

/** select 元素 → 组件状态 */
const registry = new Map();

/* ── 工具 ────────────────────────────────────────────── */

const CHEVRON_SVG = `
<svg class="js-select-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
  <path d="M4 6.5L8 10.5L12 6.5" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const isPrintable = (e) =>
  e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

/**
 * 触发器可访问名：优先取关联 <label> 的可见文本，其次 aria-label，最后 id。
 * （label 包裹 select 时 select.labels 隐式关联；直接 fallback 到 id 会让
 *  读屏读出 machine 名，如 #sync-provider → "sync-provider"。）
 */
function accessibleName(select) {
  const labels = select.labels;
  if (labels && labels.length) {
    // 包裹式 label 的 textContent 会连 select 的 option 文本一起拼进来，
    // 需剔除交互控件后再取可见文本。
    const clone = labels[0].cloneNode(true);
    clone.querySelectorAll('select, input, textarea, button').forEach((n) => n.remove());
    const txt = clone.textContent.replace(/\s+/g, ' ').trim();
    if (txt) return txt;
  }
  return select.getAttribute('aria-label') || select.id || '选择';
}

/** 在 wrapper 位置插入 wrapper 并把 select 移进去（保持原 DOM 位置） */
function wrapSelect(select, wrapper) {
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
}

/**
 * 从原生 select 的计算样式里搬运「布局属性」到 wrapper，
 * 让包裹层在 flex 行 / 窄栏 / 100% 宽等既有布局中不破坏原排版。
 * 只搬布局，不搬视觉（视觉由 select.css 的 .js-select-* 决定）。
 */
function copyLayout(select, wrapper, trigger) {
  const cs = getComputedStyle(select);
  wrapper.style.display = cs.display === 'block' ? 'block' : 'inline-flex';
  if (cs.maxWidth && cs.maxWidth !== 'none') wrapper.style.maxWidth = cs.maxWidth;
  if (cs.flexGrow !== '0') wrapper.style.flexGrow = cs.flexGrow;
  if (cs.flexShrink !== '1') wrapper.style.flexShrink = cs.flexShrink;
  if (cs.flexBasis !== 'auto') wrapper.style.flexBasis = cs.flexBasis;

  // 若原 select 是「撑满父容器」，用 100% 保持响应式；否则保留定宽。
  const parentW = select.parentElement?.clientWidth ?? 0;
  const fills = cs.width !== 'auto' && parentW > 0 &&
    Math.abs(parseFloat(cs.width) - parentW) <= 2;
  if (fills) {
    wrapper.style.width = '100%';
    trigger.style.width = '100%';
  }
}

/* ── 构建 ────────────────────────────────────────────── */

/**
 * 增强一个 <select>。幂等：同一元素重复调用只生效一次。
 * @param {HTMLSelectElement} select
 * @param {{size?:'sm'|'md', placeholder?:string}} [opts]
 */
export function enhanceSelect(select, opts = {}) {
  if (!select || select.nodeType !== 1 || select.tagName !== 'SELECT') return null;
  if (registry.has(select)) return registry.get(select);

  // 尺寸显式驱动：默认 sm（紧凑，侧栏全部下拉框）；md 仅由 data-select-size / opts.size 开启
  // （不用 font-size 探测——视觉规则已迁移到 select.css，UA 默认字号会把紧凑档误判为 md）
  const size = opts.size ?? select.dataset.selectSize ?? 'sm';

  const wrapper = document.createElement('div');
  wrapper.className = 'js-select';
  wrapper.dataset.size = size;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'js-select-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  // 触发器用 aria-label 承接原 select 的可访问名（优先可见 label 文本）
  trigger.setAttribute('aria-label', accessibleName(select));

  const valueEl = document.createElement('span');
  valueEl.className = 'js-select-value';
  trigger.append(valueEl);
  trigger.insertAdjacentHTML('beforeend', CHEVRON_SVG); // 静态 SVG，允许 innerHTML

  const pop = document.createElement('div');
  pop.className = 'js-select-pop';
  pop.id = nextId('pop');
  pop.setAttribute('role', 'listbox');
  pop.hidden = true;
  trigger.setAttribute('aria-controls', pop.id);

  copyLayout(select, wrapper, trigger);
  wrapSelect(select, wrapper);
  wrapper.appendChild(trigger);
  // pop 不进 wrapper（避免被弹窗 transform 祖先劫持 fixed），首次打开时挂到 body。

  select.classList.add('js-select-native');
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;

  const st = {
    select, wrapper, trigger, valueEl, pop, size,
    placeholder: opts.placeholder ?? '请选择',
    open: false,
    activeIndex: -1,
    items: [],
    signature: '',
    typeBuf: '',
    typeAt: 0,
    ready: false,   // pop 是否已挂到 body
  };
  registry.set(select, st);

  bind(st);
  patchValueAccessor(st);
  render(st);
  return st;
}

/**
 * 拦截外部对 select.value 的赋值，触发重绘。
 *
 * 注意：不能用「监听 option[selected] 属性变化」来做这件事——
 * `option.selected = true` / `select.value = x` 只改内部选中态，**不反映**到
 * selected 内容属性（该属性对应的是 defaultSelected）。已实测确认。
 * 而本项目恰好大量使用 `sel.value = x`（8 处）与插入前 `opt.selected = b`（2 处），
 * 故：在实例上重定义 value 访问器 + 在增强时做一次全量 render。
 */
function patchValueAccessor(st) {
  const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  if (!desc || typeof desc.set !== 'function') return;
  Object.defineProperty(st.select, 'value', {
    configurable: true,
    enumerable: true,
    get() { return desc.get.call(this); },
    set(v) {
      desc.set.call(this, v);
      scheduleRender(st);
    },
  });
}

/* ── 事件绑定 ────────────────────────────────────────── */

function bind(st) {
  const { trigger, select } = st;

  trigger.addEventListener('click', () => {
    if (select.disabled) return;
    st.open ? close(st) : openPop(st);
  });
  trigger.addEventListener('keydown', (e) => onKeyDown(st, e));
  trigger.addEventListener('blur', () => { if (st.open) close(st); });

  // 感知原生 option 增删（loadPoolViews 用 replaceChildren 重填）
  st.mo = new MutationObserver(() => scheduleRender(st));
  st.mo.observe(select, { childList: true, subtree: true });
}

let renderRaf = 0;
const pending = new Set();
function scheduleRender(st) {
  pending.add(st);
  if (renderRaf) return;
  renderRaf = requestAnimationFrame(() => {
    renderRaf = 0;
    for (const s of pending) render(s);
    pending.clear();
  });
}

/* ── 渲染 ────────────────────────────────────────────── */

function optionSignature(select) {
  return [...select.options].map((o) => o.value + '\x00' + o.text).join('\x01');
}

function selectedLabel(st) {
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

function render(st) {
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

function buildItems(st) {
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

function syncItems(st) {
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

function defaultActiveIndex(st) {
  const { select } = st;
  const i = [...select.options].findIndex((o) => o.selected);
  return i >= 0 ? i : (select.options.length ? 0 : -1);
}

/* ── 选中 ────────────────────────────────────────────── */

function choose(st, index) {
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

function dispatchChange(select) {
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/* ── 开关 ────────────────────────────────────────────── */

function openPop(st) {
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

function close(st) {
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

function onViewportChange(e) {
  if (!openState) return;
  // 浮层内部滚动（overflow-y:auto）不触发重定位，避免多余重排
  if (e && openState.pop.contains(e.target)) return;
  position(openState);
}

function onDocPointerDown(e) {
  if (!openState) return;
  const { trigger, pop } = openState;
  if (trigger.contains(e.target) || pop.contains(e.target)) return;
  close(openState);
}

/* ── 定位（design.md §3） ────────────────────────────── */

function position(st) {
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

function setActive(st, index, scroll = true) {
  st.activeIndex = index;
  paintActive(st);
  if (scroll) {
    st.items[index]?.scrollIntoView({ block: 'nearest' });
  }
}

function paintActive(st) {
  st.items.forEach((el, i) => el.classList.toggle('is-active', i === st.activeIndex));
  const { trigger, items } = st;
  const cur = items[st.activeIndex];
  if (st.open && cur) trigger.setAttribute('aria-activedescendant', cur.id);
  else trigger.removeAttribute('aria-activedescendant');
}

function move(st, delta) {
  const n = st.items.length;
  if (!n) return;
  const next = Math.max(0, Math.min(n - 1, st.activeIndex + delta));
  setActive(st, next);
}

function onKeyDown(st, e) {
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

function typeahead(st, ch) {
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

/* ── 全局：自动增强 + 动态 select 监听 ───────────────── */

/** 扫描并增强 root 下所有 select（幂等）。动态生成的会被全局 observer 捕获。 */
export function autoEnhance(root = document) {
  for (const el of root.querySelectorAll('select:not([data-no-enhance])')) {
    enhanceSelect(el);
  }
  startGlobalObserver();
}

let globalMo = null;
function startGlobalObserver() {
  if (globalMo) return;
  globalMo = new MutationObserver(() => {
    // 动态新增的 select（如 sidepanel.js 运行时创建）自动增强
    for (const el of document.querySelectorAll('select:not([data-no-enhance])')) {
      if (!registry.has(el) && el.isConnected) enhanceSelect(el);
    }
    // 已 detach 的实例清理浮层，避免 body 里留孤儿
    for (const [sel, st] of registry) {
      if (sel.isConnected) continue;
      registry.delete(sel);
      st.pop.remove();
      st.mo.disconnect();
    }
  });
  globalMo.observe(document.documentElement, { childList: true, subtree: true });
}
