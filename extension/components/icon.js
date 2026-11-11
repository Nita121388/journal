/**
 * icon.js — inline SVG 图标基元（components 层）
 *
 * 为什么是 inline SVG：
 *   - MV3 CSP 为 `script-src 'self'`，不能引外部 sprite / CDN；
 *   - 断网（离线）也要能渲染，不得产生任何网络请求；
 *   - 用 `currentColor` + `stroke` 继承，图标自动跟随文字色与暗色主题。
 *
 * 硬约定（design.md §3.1 / design-system.md §5）：
 *   - 统一 `viewBox="0 0 24 24"`、`fill="none"`、`stroke="currentColor"`、
 *     `stroke-linecap/linejoin="round"`、默认 `stroke-width="1.75"`。
 *   - 装饰性图标一律 `aria-hidden="true"` + `focusable="false"`；
 *     图标按钮的可读名称由调用方（`components/button.js` 的 `iconButton`）提供 `aria-label`。
 *   - **禁止** 用 `innerHTML` 拼 SVG（项目规范：用户/动态内容不进 innerHTML）。
 *     故 `ICONS` 描述为「形状描述符数组」，由 `icon()` 用 `createElementNS` 逐个建节点。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 生成一条 `<path>` 描述符。 */
const p = (d, extra = {}) => ['path', { d, ...extra }];
/** 生成一个 `<circle>` 描述符。 */
const c = (cx, cy, r, extra = {}) => ['circle', { cx, cy, r, ...extra }];
/** 生成一个 `<rect>` 描述符。 */
const r = (x, y, width, height, radius, extra = {}) =>
  ['rect', { x, y, width, height, rx: radius, ...extra }];

/**
 * 图标形状表：name → 形状描述符数组（`[tagName, attrs]`）。
 *
 * 覆盖现役 HTML 里所有「emoji 功能图标」对应的 name。
 * `layout` / `list` / `grid` 为 P3 视图切换预留（design.md §3.1 的 26 个 + 3 个布局类）。
 * `flame` / `chevronDown` 为 P2 外壳（打卡 section 头 / Skills 折叠箭头）新增。
 *
 * @type {Record<string, Array<[string, Record<string, string|number>]>>}
 */
export const ICONS = {
  menu: [p('M4 7h16'), p('M4 12h16'), p('M4 17h16')],

  /* 状态灯：实心圆点（填充 currentColor，不描边） */
  status: [c(12, 12, 4.5, { fill: 'currentColor', stroke: 'none' })],

  /* 设置：滑杆（比齿轮更克制，窄栏里更易辨认） */
  settings: [
    p('M4 7h4.5'), p('M12.5 7H20'), c(10.5, 7, 2.2),
    p('M4 17h4.5'), p('M12.5 17H20'), c(10.5, 17, 2.2),
    p('M4 12h11.5'), p('M19.5 12H20'), c(17.5, 12, 2.2),
  ],

  plus: [p('M12 5v14'), p('M5 12h14')],

  /* 宽屏/全屏：四角向外 */
  expand: [p('M9 4H4v5'), p('M15 4h5v5'), p('M9 20H4v-5'), p('M15 20h5v-5')],

  /* 时间范围：左右箭头夹一条轨 */
  range: [p('M9 6l-5 6 5 6'), p('M15 6l5 6-5 6'), p('M4 12h16')],

  calendar: [r(3, 5, 18, 16, 3), p('M8 3v4'), p('M16 3v4'), p('M3 10h18')],

  /* 周视图：日历 + 一周七列刻度 */
  week: [
    r(3, 5, 18, 16, 3), p('M8 3v4'), p('M16 3v4'), p('M3 10h18'),
    p('M7 13.5v4'), p('M10.3 13.5v4'), p('M13.7 13.5v4'), p('M17 13.5v4'),
  ],

  /* 月视图：日历 + 日期点阵 */
  month: [
    r(3, 5, 18, 16, 3), p('M8 3v4'), p('M16 3v4'), p('M3 10h18'),
    p('M8 14v.01'), p('M12 14v.01'), p('M16 14v.01'),
    p('M8 17.5v.01'), p('M12 17.5v.01'), p('M16 17.5v.01'),
  ],

  /* 时间线：竖轴 + 错落区块 */
  timeline: [
    p('M6 4v16'),
    p('M9.5 7.5h10'), p('M9.5 12h6.5'), p('M9.5 16.5h8'),
  ],

  chevronLeft: [p('M15 5.5L8.5 12l6.5 6.5')],
  chevronRight: [p('M9 5.5l6.5 6.5L9 18.5')],

  /* 展开箭头（section header 的折叠开关，替代 ▾） */
  chevronDown: [p('M6.5 9.5L12 15l5.5-5.5')],

  /* 打卡/连续天数（替代 🔥） */
  flame: [
    p('M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.2-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z'),
  ],

  search: [c(11, 11, 7), p('M20 20l-4.4-4.4')],
  filter: [p('M4 6.5h16'), p('M7 12h10'), p('M10 17.5h4')],

  /* 模板：两层错页 */
  template: [r(3, 8, 13, 13, 2), p('M8 4h9a3 3 0 0 1 3 3v9')],

  save: [p('M12 4v10'), p('M8 11l4 4 4-4'), p('M4 19h16')],

  copy: [
    r(9, 9, 11, 11, 2),
    p('M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1'),
  ],

  tag: [
    p('M3 3h8l9.5 9.5a2 2 0 0 1 0 2.8l-4.2 4.2a2 2 0 0 1-2.8 0L3 11V3z'),
    c(7.5, 7.5, 1.3),
  ],

  folder: [
    p('M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z'),
  ],

  close: [p('M6 6l12 12'), p('M18 6L6 18')],
  check: [p('M4.5 12.5l5 5L19.5 6.5')],

  more: [
    c(5, 12, 1.4, { fill: 'currentColor', stroke: 'none' }),
    c(12, 12, 1.4, { fill: 'currentColor', stroke: 'none' }),
    c(19, 12, 1.4, { fill: 'currentColor', stroke: 'none' }),
  ],

  /* 图钉（用于后续阶段「固定」卡片） */
  pin: [p('M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z'), c(12, 10, 2.4)],

  /* 人形（创建人：编辑器来源行，2026-11-11） */
  user: [c(12, 8, 3.5), p('M5.5 20a6.5 6.5 0 0 1 13 0')],

  /* 闪光（AI 提示，替代 🤖 emoji） */
  sparkle: [
    p('M12 3l1.9 5.4L19 10.5l-5.1 2.1L12 18l-1.9-5.4L5 10.5l5.1-2.1L12 3z'),
    p('M18.5 15.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7.7-1.9z'),
  ],

  trash: [
    p('M4 7h16'),
    p('M9.5 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7'),
    p('M6.5 7l.9 12.1A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7'),
    p('M10.5 11v5.5'), p('M13.5 11v5.5'),
  ],

  /* 布局三件套（P3 视图/密度切换用） */
  layout: [r(3, 3, 18, 18, 2), p('M3 9h18'), p('M9.5 9v12')],
  list: [p('M4 6.5h2'), p('M9.5 6.5H20'), p('M4 12h2'), p('M9.5 12H20'), p('M4 17.5h2'), p('M9.5 17.5H20')],
  grid: [r(3, 3, 8, 8, 1.6), r(13, 3, 8, 8, 1.6), r(3, 13, 8, 8, 1.6), r(13, 13, 8, 8, 1.6)],

  /* ── P5 弹窗属性行（替代属性键 emoji：⚙️📊🚩📅⏱️📁） ── */
  /* 进度：半圆刻度 + 指针 */
  gauge: [p('M4 16a8 8 0 1 1 16 0'), p('M12 16l4.2-4.2'), c(12, 16, 1.2, { fill: 'currentColor', stroke: 'none' })],
  /* 优先级：旗杆 + 旗面 */
  flag: [p('M6 20V4'), p('M6 5h11l-2.2 3.5L17 12H6')],
  /* 排程：钟面 + 指针 */
  clock: [c(12, 12, 8), p('M12 7.5V12l3 2')],
  /* 状态「进行中」：实心播放三角 */
  play: [p('M9 6l9 6-9 6z', { fill: 'currentColor' })],
  /* 编辑：铅笔（替代行内「✎」字形） */
  pencil: [p('M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z'), p('M14.5 6.5l3 3')],
  /* 同步：两条对向弧线 + 箭头 */
  sync: [
    p('M20 12a8 8 0 0 1-13.7 5.6'),
    p('M4 12a8 8 0 0 1 13.7-5.6'),
    p('M17.7 3v3.6h-3.6'),
    p('M6.3 21v-3.6h3.6'),
  ],
  /* 笔记/想法：纸张 + 三条文行（也用作 options 页 logo） */
  note: [r(5, 3, 14, 18, 2), p('M9 8h6'), p('M9 12h6'), p('M9 16h4')],
};

/** 未知 name 的占位图形：空框 + 叉，肉眼可辨、且不带外链。 */
const FALLBACK = [r(4, 4, 16, 16, 2), p('M9 9l6 6'), p('M15 9l-6 6')];

/** 已警告过的 name（同一个笔误只吵一次）。 */
const warned = new Set();

/**
 * 生成一个 inline SVG 图标元素。
 *
 * @param {string} name `ICONS` 的键；未知 name 退化为占位方块并 `console.warn` 一次
 * @param {object} [opts]
 * @param {number} [opts.size=20] 图标边长（px）；24 高控件内建议 16
 * @param {number} [opts.stroke=1.75] 描边宽度
 * @param {string} [opts.cls=''] 追加的 class（基类 `icon` 始终存在）
 * @returns {SVGSVGElement}
 */
export function icon(name, { size = 20, stroke = 1.75, cls = '' } = {}) {
  const shapes = ICONS[name];
  if (!shapes && !warned.has(name)) {
    warned.add(name);
    console.warn(`[icon] 未知图标名 "${name}"，已退化为占位图形（请检查拼写）`);
  }

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(stroke));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', cls ? `icon ${cls}` : 'icon');

  for (const [tag, attrs] of shapes ?? FALLBACK) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    svg.append(node);
  }

  return svg;
}

/**
 * 把 HTML 里 `data-icon="name"` 的占位元素填成真实 SVG（**prepend**，不移除宿主已有文本/子节点）。
 *
 * 为什么需要它：静态 HTML 无法直接内联 20 条手写 SVG（维护成本 + emoji 复辟风险），
 * 于是 HTML 只写占位属性、由组合根在建交互绑定前统一注入。这样：
 *   - DOM 里**没有**功能 emoji（design-system §8 反模式）；
 *   - 图标实现只有 `ICONS` 一处（改一处全站生效）；
 *   - 不产生 innerHTML（项目规范禁止用 innerHTML 拼内容）。
 *
 * @param {Document|Element} [root=document] 注入范围（默认整页）
 * @returns {number} 本次实际注入的元素个数（已注入过的跳过，可安全重复调用）
 */
export function hydrateIcons(root = document) {
  if (!root?.querySelectorAll) return 0;
  const targets = [];
  // querySelectorAll 不含 root 自身；root 自己带占位属性时也算一个
  if (typeof root.matches === 'function' && root.matches('[data-icon]')) targets.push(root);
  targets.push(...root.querySelectorAll('[data-icon]'));

  let injected = 0;
  for (const host of targets) {
    // 同一个元素只注一次：否则重复 hydrate 会叠加多层 SVG（先 prepend 的会留在后面）
    if (host.dataset.iconReady === 'true') continue;

    const name = host.dataset.icon || '';
    const size = Number.parseInt(host.dataset.iconSize, 10) || 20;
    const stroke = Number.parseFloat(host.dataset.iconStroke) || 1.75;
    host.prepend(icon(name, { size, stroke }));
    host.dataset.iconReady = 'true';
    injected += 1;
  }
  return injected;
}
